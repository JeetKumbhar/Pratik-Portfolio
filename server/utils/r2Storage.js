import { randomBytes } from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { httpError } from './httpError.js';

/**
 * Cloudflare R2 (S3-compatible object storage) for the ORIGINAL portfolio photographs.
 *
 * How an upload works:
 *   1. the admin asks the server to prepare an upload (type + size) →  presignPut() makes a short-lived address for ONE object
 *      in the TEMPORARY folder  tmp/portfolio/YYYY/MM/<random>.<ext>
 *   2. the BROWSER sends the file straight to that address: the 25-40 MB photo never passes through Render
 *   3. the server checks the temporary object (head, then the whole file streamed through the image validator), COPIES it inside
 *      R2 to the permanent folder  portfolio/YYYY/MM/<same random>.<ext>, saves the photo record in MongoDB, and deletes the temporary object
 *
 * Why two folders: the signed address cannot limit how many bytes are sent, and an upload may never be finalized. Everything
 * under  tmp/  is disposable by definition, so ONE lifecycle rule in Cloudflare ("delete objects with prefix tmp/ after 1 day")
 * cleans up every abandoned, oversized or refused upload. Nothing under  portfolio/  is ever touched by that rule, and a photo
 * only gets there after it passed every check.
 *
 * .env (Render → Environment). The keys NEVER go to the browser, the frontend, Git or the logs:
 *   R2_ACCOUNT_ID         Cloudflare account id (R2 → Overview)
 *   R2_ACCESS_KEY_ID      R2 API token → "Object Read & Write", limited to the one bucket
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET             bucket name
 *   R2_PUBLIC_BASE_URL    where visitors fetch files from, no trailing slash (a custom domain for the bucket; decided in Phase 3)
 *   R2_MAX_UPLOAD_MB      optional, default 40
 *   R2_ENDPOINT           optional: replaces https://<account>.r2.cloudflarestorage.com (used by the tests with a fake R2)
 *   IMAGE_STORAGE_PROVIDER  cloudinary (default) | r2  → where NEW portfolio photos are uploaded
 *
 * Facts this file relies on (Cloudflare docs): presigned URLs work for PUT/GET/HEAD/DELETE on the S3 endpoint only (not on a custom
 * domain), last 1 second to 7 days, and a signed Content-Type is enforced. A signed Content-Length is NOT documented, so the real
 * size is checked after the upload instead (see portfolioController.finalizeUpload).
 */
export const DEFAULT_MAX_UPLOAD_MB = 40;
export const PRESIGN_SECONDS = 600; // the upload address works for 10 minutes
const CALL_TIMEOUT_MS = 20000;
const READ_TIMEOUT_MS = 120000; // streaming a whole 40 MB photo through the validator

export const TEMP_PREFIX = 'tmp/'; // disposable: the lifecycle rule deletes this folder's objects
export const PERMANENT_PREFIX = 'portfolio/'; // finished photos: never matched by that rule

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const KEY_RE = /^portfolio\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(jpg|png|webp)$/; // permanent
const TEMP_KEY_RE = /^tmp\/portfolio\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(jpg|png|webp)$/; // temporary

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

const cfg = () => {
  const accountId = clean(process.env.R2_ACCOUNT_ID);
  const endpoint = clean(process.env.R2_ENDPOINT).replace(/\/+$/, '') || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  return {
    accountId,
    endpoint,
    accessKeyId: clean(process.env.R2_ACCESS_KEY_ID),
    secretAccessKey: clean(process.env.R2_SECRET_ACCESS_KEY),
    bucket: clean(process.env.R2_BUCKET),
    publicBaseUrl: clean(process.env.R2_PUBLIC_BASE_URL).replace(/\/+$/, ''),
  };
};

/** Names (never values) of the settings that are still missing. Empty list = ready. */
export function missingSettings() {
  const c = cfg();
  const missing = [];
  if (!c.endpoint) missing.push('R2_ACCOUNT_ID');
  if (!c.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!c.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!c.bucket) missing.push('R2_BUCKET');
  if (!/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(c.publicBaseUrl)) missing.push('R2_PUBLIC_BASE_URL');
  return missing;
}
export const isConfigured = () => missingSettings().length === 0;

/** 'r2' or 'cloudinary' (the default, and what any unknown value means). Decides where NEW uploads go. */
export const activeProvider = () => (clean(process.env.IMAGE_STORAGE_PROVIDER).toLowerCase() === 'r2' ? 'r2' : 'cloudinary');

/** Largest photo accepted, in bytes (R2_MAX_UPLOAD_MB, default 40). */
export function maxUploadBytes() {
  const mb = Number(clean(process.env.R2_MAX_UPLOAD_MB));
  const value = Number.isFinite(mb) && mb > 0 && mb <= 5000 ? mb : DEFAULT_MAX_UPLOAD_MB;
  return Math.floor(value * 1024 * 1024);
}

export const isAllowedType = (type) => typeof type === 'string' && Object.hasOwn(EXTENSIONS, type);

/** A TEMPORARY storage key we made ourselves. It is random and built here: a client-supplied name or path is never used. */
export function createTempKey(contentType, now = new Date()) {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new Error('Unsupported image type');
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${TEMP_PREFIX}${PERMANENT_PREFIX}${year}/${month}/${randomBytes(16).toString('hex')}.${ext}`;
}
export const isTempKey = (key) => typeof key === 'string' && TEMP_KEY_RE.test(key);
export const isOwnKey = (key) => typeof key === 'string' && KEY_RE.test(key);

/** The permanent key a temporary key turns into when the upload is finalized (the same name without the tmp/ folder). */
export function finalKeyFor(tempKey) {
  if (!isTempKey(tempKey)) throw new Error('Not a temporary upload key');
  return tempKey.slice(TEMP_PREFIX.length);
}

/** The address visitors use. Phase 3 may serve resized copies from another address; the key is what stays stable. */
export const publicUrl = (key) => `${cfg().publicBaseUrl}/${key}`;

/** A stored R2 photo record is genuine only if its key is one of ours and its address is exactly what we would have made. */
export const isOwnImage = (image) => Boolean(image) && image.provider === 'r2' && isOwnKey(image.key) && image.url === publicUrl(image.key);

const objectUrl = (key) => {
  const { endpoint, bucket } = cfg();
  return `${endpoint}/${bucket}/${key}`;
};

const client = () => {
  const { accessKeyId, secretAccessKey } = cfg();
  return new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto', retries: 1 });
};

function ensureReady() {
  const missing = missingSettings();
  if (missing.length) throw httpError(503, `Cloudflare R2 is not set up yet. Missing in the server settings: ${missing.join(', ')}.`);
}

/**
 * A short-lived address the BROWSER can upload ONE file to:  PUT <address>  with header  Content-Type: <contentType>
 * The address is signed for exactly this object, this method and this content type; anything else is refused by R2.
 * Treat it like a password until it expires: it is never logged.
 */
export async function presignPut(key, contentType, expiresInSeconds = PRESIGN_SECONDS) {
  ensureReady();
  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await client().sign(new Request(url, { method: 'PUT', headers: { 'Content-Type': contentType } }), { aws: { signQuery: true, allHeaders: true } });
  return signed.url;
}

async function call(key, method, headers = {}, { timeoutMs = CALL_TIMEOUT_MS, signal } = {}) {
  ensureReady();
  try {
    return await client().fetch(objectUrl(key), { method, headers, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  } catch { // the details can contain the address; say only what happened
    throw httpError(502, 'Could not reach Cloudflare R2. Please try again.');
  }
}

const refused = (res) => httpError(502, `Cloudflare R2 refused the request (${res.status}).`);

/** → { size, contentType, etag } of the stored object, or null when it does not exist. */
export async function head(key) {
  const res = await call(key, 'HEAD');
  if (res.status === 404) return null;
  if (!res.ok) throw refused(res);
  return {
    size: Number(res.headers.get('content-length')),
    contentType: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(),
    etag: res.headers.get('etag') || undefined, // identifies this exact version of the object
  };
}

/** The object changed (or disappeared) between two steps of finalizing; the caller treats the upload as unusable. */
const objectChanged = () => Object.assign(httpError(409, 'The uploaded file changed while it was being checked.'), { objectChanged: true });

/**
 * The whole object as a stream of Buffers (an async generator: stop reading and the connection is closed).
 * With `etag`, R2 only answers if the object is still exactly the version that was measured with head(); otherwise → objectChanged.
 */
export async function* openRead(key, { etag } = {}) {
  const stop = new AbortController();
  try {
    const res = await call(key, 'GET', etag ? { 'If-Match': etag } : {}, { timeoutMs: READ_TIMEOUT_MS, signal: stop.signal });
    if (res.status === 412 || res.status === 404) throw objectChanged();
    if (!res.ok) throw refused(res);
    try {
      for await (const chunk of res.body) yield chunk;
    } catch { // the connection broke (or timed out) while reading
      throw httpError(502, 'Could not reach Cloudflare R2. Please try again.');
    }
  } finally {
    stop.abort();
  }
}

/**
 * Copies an object INSIDE R2 (nothing is downloaded or uploaded by the server). With `etag` the copy only happens if the source is
 * still the exact version that was checked (x-amz-copy-source-if-match); otherwise → objectChanged. Overwrites the destination,
 * which is what makes finalizing safe to repeat (the destination key is always derived from the source key).
 */
export async function copy(sourceKey, destKey, { etag } = {}) {
  ensureReady();
  const headers = { 'x-amz-copy-source': `/${cfg().bucket}/${sourceKey}`, ...(etag ? { 'x-amz-copy-source-if-match': etag } : {}) };
  const res = await call(destKey, 'PUT', headers);
  if (res.status === 412 || res.status === 404) throw objectChanged();
  if (!res.ok) throw refused(res);
  // S3 can answer 200 and still carry an error in the body
  const text = await res.text().catch(() => '');
  if (/<Error[\s>]/i.test(text)) throw httpError(502, 'Cloudflare R2 did not complete the copy.');
}

/** Deletes the object. true = it is gone (or was already gone). Throws when R2 cannot be reached. */
export async function remove(key) {
  const res = await call(key, 'DELETE');
  if (res.ok || res.status === 404) return true;
  throw refused(res);
}
