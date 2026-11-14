import { createHmac, timingSafeEqual } from 'node:crypto';
import { httpError } from './httpError.js';

/**
 * An "upload intent" is a small signed note the server hands out when it prepares an upload:
 *     "admin X may upload ONE file of type T and size S to storage key K, until time E".
 * The browser sends it back when the upload is done (finalize). Because only the server can sign it, the browser cannot invent
 * a storage key, claim somebody else's file, or change the size/type it announced. Nothing is stored in the database for it.
 *
 * The signing key is derived from JWT_SECRET (and a fixed label), so no new secret has to be configured and the key is not the
 * login key itself. Format:  base64url(json) + "." + base64url(hmac-sha256)
 */
export const INTENT_TTL_MS = 60 * 60 * 1000; // an upload may take a while on a slow connection; finalizing is allowed for an hour

const MAX_TOKEN_LENGTH = 1024;
const LABEL = 'portfolio-upload-intent/v1';

function signingKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw httpError(500, 'JWT_SECRET is missing or too short. Put at least 32 random characters in .env');
  return createHmac('sha256', secret).update(LABEL).digest();
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const mac = (body) => createHmac('sha256', signingKey()).update(body).digest();

/** → token string */
export function createIntent({ key, type, size, adminId }, now = Date.now(), ttlMs = INTENT_TTL_MS) {
  const body = b64(JSON.stringify({ k: key, t: type, s: size, a: String(adminId), e: now + ttlMs }));
  return `${body}.${b64(mac(body))}`;
}

const invalid = () => httpError(400, 'This upload request is not valid. Please choose the photo again.');

/** → { key, type, size }, or throws a 400 (tampered, malformed, somebody else's, or expired) */
export function verifyIntent(token, adminId, now = Date.now()) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) throw invalid();
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw invalid();
  const [body, signature] = parts;

  const given = Buffer.from(signature, 'base64url');
  const expected = mac(body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw invalid();

  let data;
  try { data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw invalid(); }
  if (!data || typeof data.k !== 'string' || typeof data.t !== 'string' || !Number.isInteger(data.s) || typeof data.a !== 'string' || !Number.isFinite(data.e)) throw invalid();
  if (data.a !== String(adminId)) throw invalid(); // somebody else's upload
  if (now > data.e) throw httpError(400, 'This upload request has expired. Please choose the photo again.');
  return { key: data.k, type: data.t, size: data.s };
}
