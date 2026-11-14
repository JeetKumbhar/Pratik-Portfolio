/**
 * npm run test:r2
 *
 * Cloudflare R2 for the original portfolio photographs (server side): direct browser-to-R2 uploads into a TEMPORARY folder (tmp/),
 * whole-file validation, and a checked copy into permanent storage (portfolio/).
 *
 * WHAT THIS TEST IS (read before trusting a green result):
 *   - It runs the REAL Express routes, login/admin checks, rate limiter, controller, validation, Mongoose schema, upload-token code,
 *     R2 signing code (aws4fetch) and image validator, over real HTTP.
 *   - "R2" is a FAKE S3 server started by this script on 127.0.0.1. It checks every request's AWS Signature V4 with its OWN
 *     implementation (written from the AWS specification, and itself checked below against AWS's published examples), so a wrong
 *     signature, content type, key or an expired address is refused the way R2 refuses it. It also implements what finalize relies
 *     on: ETags, If-Match, server-side copy with x-amz-copy-source-if-match, and (to simulate failures) refused or half-done copies.
 *     A bucket lifecycle rule ("delete objects under tmp/") is simulated by sweep().
 *   - MongoDB is an IN-MEMORY STAND-IN (model methods replaced; filters run by the `mingo` library; the unique index on
 *     image.key is simulated by hand and the real schema is checked for declaring it).
 *   - Cloudinary's web address is intercepted; nothing is sent to it.
 *   - The image validator is also checked against small files written by REAL encoders (Pillow: JPEG, progressive JPEG, EXIF-rotated
 *     JPEG, PNG, palette PNG, WebP lossy/lossless), embedded below as base64.
 *
 *   NOT TESTED HERE (needs your real accounts): real Cloudflare R2 (credentials, bucket CORS, the real response headers, whether a
 *   real R2 enforces the signed Content-Type and honours If-Match / x-amz-copy-source-if-match exactly like this fake, the real
 *   lifecycle rule), a real MongoDB server and its real unique index, and a real browser doing the upload. See the checklist in the README.
 */
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';

const SECRET_KEY = 'R2-SECRET-ACCESS-KEY-DO-NOT-LEAK-0123456789';
const ACCESS_KEY_ID = 'R2TESTACCESSKEYID1234';
const BUCKET = 'portfolio-test';
const PUBLIC_BASE = 'https://media.test.example';

process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.R2_ACCOUNT_ID = 'a'.repeat(32);
process.env.R2_ACCESS_KEY_ID = ACCESS_KEY_ID;
process.env.R2_SECRET_ACCESS_KEY = SECRET_KEY;
process.env.R2_BUCKET = BUCKET;
process.env.R2_PUBLIC_BASE_URL = `${PUBLIC_BASE}/`; // a trailing slash must be tolerated
process.env.IMAGE_STORAGE_PROVIDER = 'r2';
delete process.env.R2_MAX_UPLOAD_MB;
delete process.env.NODE_ENV;
process.env.CLOUDINARY_CLOUD_NAME = 'democloud';
process.env.CLOUDINARY_API_KEY = 'cloud-key-123';
process.env.CLOUDINARY_API_SECRET = 'CLOUD-SECRET-VALUE-XYZ';
delete process.env.CLOUDINARY_FOLDER;

const { Aggregator, Query } = await import('mingo').catch(() => {
  console.log('SKIPPED: this test needs the "mingo" dev dependency. Run: npm install');
  process.exit(1);
});
const { Portfolio, User } = await import('../models/index.js');
const { signToken } = await import('../utils/token.js');
const { errorHandler, notFound } = await import('../middleware/errorMiddleware.js');
const { default: portfolioRoutes } = await import('../routes/portfolioRoutes.js');
const r2 = await import('../utils/r2Storage.js');
const { createIntent, verifyIntent } = await import('../utils/uploadIntent.js');
const { inspectImage, sniffType, crc32Js } = await import('../utils/imageInspect.js');

// ---------------------------------------------------------------------- quiet console (and a record of what was logged)
const logs = [];
const realLog = console.log;
const out = (s) => realLog(s);
console.log = (...a) => logs.push(a.join(' '));
console.error = (...a) => logs.push(a.join(' '));
console.info = (...a) => logs.push(a.join(' '));

let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; out(`PASS  ${name}`); } catch (err) {
    failed += 1; failures.push(name); out(`FAIL  ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
  }
}
const section = (title) => out(`\n--- ${title} ---`);

// ====================================================================== AWS Signature V4, written from the specification
const sha256 = (d) => createHash('sha256').update(d).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function sigV4({ method, pathname, searchParams, headers, signedHeaders, payloadHash, amzDate, region, service, secret, excludeParam }) {
  const canonicalUri = pathname.split('/').map((s) => enc(decodeURIComponent(s))).join('/');
  const canonicalQuery = [...searchParams].filter(([k]) => k !== excludeParam).map(([k, v]) => [enc(k), enc(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&');
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${String(headers[h] ?? '').trim().replace(/\s+/g, ' ')}\n`).join('');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders.join(';'), payloadHash].join('\n');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), 'aws4_request');
  return createHmac('sha256', key).update(toSign).digest('hex');
}
const parseAmzDate = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));

// ====================================================================== a FAKE R2 (S3 API) on 127.0.0.1
const fake = { objects: new Map(), calls: [], mode: 'ok', clockOffsetMs: 0, server: null, port: 0, beforeCopy: null, beforeGet: null };
const resetFake = () => { fake.objects.clear(); fake.calls.length = 0; fake.mode = 'ok'; fake.clockOffsetMs = 0; fake.beforeCopy = null; fake.beforeGet = null; };
const etagOf = (body) => `"${createHash('md5').update(body).digest('hex')}"`;
const keysUnder = (prefix) => [...fake.objects.keys()].filter((k) => k.startsWith(prefix));
/** What a bucket lifecycle rule "delete objects whose key starts with <prefix>" does when it runs. */
const sweep = (prefix) => { const gone = keysUnder(prefix); gone.forEach((k) => fake.objects.delete(k)); return gone.length; };

function verifyRequest(req, url) {
  const now = Date.now() + fake.clockOffsetMs;
  const headers = req.headers; // lower-cased by node
  if (url.searchParams.has('X-Amz-Signature')) { // a presigned address (query string)
    const q = url.searchParams;
    if (q.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256') return 'bad algorithm';
    const [accessKey, date, region, service] = (q.get('X-Amz-Credential') || '').split('/');
    if (accessKey !== ACCESS_KEY_ID) return 'unknown access key';
    const amzDate = q.get('X-Amz-Date') || '';
    const expires = Number(q.get('X-Amz-Expires'));
    if (!(expires >= 1 && expires <= 604800)) return 'bad expiry';
    if (now > parseAmzDate(amzDate) + expires * 1000) return 'expired';
    if (parseAmzDate(amzDate) > now + 5 * 60 * 1000) return 'from the future';
    const expected = sigV4({
      method: req.method, pathname: url.pathname, searchParams: q, headers, signedHeaders: (q.get('X-Amz-SignedHeaders') || '').split(';'),
      payloadHash: 'UNSIGNED-PAYLOAD', amzDate, region, service, secret: SECRET_KEY, excludeParam: 'X-Amz-Signature',
    });
    return date === amzDate.slice(0, 8) && expected === q.get('X-Amz-Signature') ? null : 'SignatureDoesNotMatch';
  }
  const m = /^AWS4-HMAC-SHA256 Credential=([^,]+), SignedHeaders=([^,]+), Signature=([0-9a-f]+)$/.exec(headers.authorization || '');
  if (!m) return 'no credentials';
  const [accessKey, date, region, service] = m[1].split('/');
  if (accessKey !== ACCESS_KEY_ID) return 'unknown access key';
  const amzDate = headers['x-amz-date'] || '';
  if (Math.abs(now - parseAmzDate(amzDate)) > 15 * 60 * 1000) return 'clock skew';
  const expected = sigV4({
    method: req.method, pathname: url.pathname, searchParams: url.searchParams, headers, signedHeaders: m[2].split(';'),
    payloadHash: headers['x-amz-content-sha256'] || '', amzDate, region, service, secret: SECRET_KEY,
  });
  return date === amzDate.slice(0, 8) && expected === m[3] ? null : 'SignatureDoesNotMatch';
}

const fakeServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const [, bucket, ...rest] = url.pathname.split('/');
  const key = rest.join('/');
  const copySource = req.headers['x-amz-copy-source'];
  fake.calls.push(`${copySource ? 'COPY' : req.method} ${key}`); // never the query string: it holds the signature
  if (fake.mode === 'drop') return req.socket.destroy();
  if (fake.mode === 'down') { res.writeHead(500); return res.end('<Error><Code>InternalError</Code></Error>'); }
  const problem = verifyRequest(req, url);
  if (problem) { res.writeHead(403); return res.end(`<Error><Code>${problem}</Code></Error>`); }
  if (bucket !== BUCKET) { res.writeHead(404); return res.end('<Error><Code>NoSuchBucket</Code></Error>'); }

  if (req.method === 'PUT' && copySource) { // CopyObject: the destination is the address, the source is in the header
    if (fake.mode === 'copyFail') { res.writeHead(500); return res.end('<Error><Code>InternalError</Code></Error>'); }
    if (fake.beforeCopy) await fake.beforeCopy();
    const source = fake.objects.get(copySource.split('/').slice(2).join('/'));
    if (!source) { res.writeHead(404); return res.end('<Error><Code>NoSuchKey</Code></Error>'); }
    const ifMatch = req.headers['x-amz-copy-source-if-match'];
    if (ifMatch && ifMatch !== etagOf(source.body)) { res.writeHead(412); return res.end('<Error><Code>PreconditionFailed</Code></Error>'); }
    if (fake.mode === 'copyErrorBody') { res.writeHead(200); return res.end('<Error><Code>InternalError</Code><Message>We encountered an internal error.</Message></Error>'); }
    const copied = fake.mode === 'copyHalf' ? source.body.subarray(0, Math.floor(source.body.length / 2)) : source.body; // copyHalf: answers "ok" but stored half
    fake.objects.set(key, { body: copied, type: source.type });
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    return res.end(`<CopyObjectResult><ETag>${etagOf(copied)}</ETag></CopyObjectResult>`);
  }
  if (req.method === 'PUT') {
    fake.objects.set(key, { body, type: req.headers['content-type'] || 'binary/octet-stream' });
    res.writeHead(200, { ETag: etagOf(body) });
    return res.end();
  }
  if (req.method === 'DELETE') {
    if (fake.mode === 'deleteFail') { res.writeHead(500); return res.end('<Error><Code>InternalError</Code></Error>'); }
    fake.objects.delete(key); res.writeHead(204); return res.end();
  }
  let object = fake.objects.get(key);
  if (req.method === 'GET' && fake.beforeGet) { await fake.beforeGet(); object = fake.objects.get(key); }
  if (!object) { res.writeHead(404); return res.end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>'); }
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'Content-Length': object.body.length, 'Content-Type': object.type, ETag: etagOf(object.body) });
    return res.end();
  }
  if (req.method === 'GET') {
    if (req.headers['if-match'] && req.headers['if-match'] !== etagOf(object.body)) { res.writeHead(412); return res.end('<Error><Code>PreconditionFailed</Code></Error>'); }
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    if (range) {
      const part = object.body.subarray(+range[1], +range[2] + 1);
      res.writeHead(206, { 'Content-Length': part.length, 'Content-Type': object.type, ETag: etagOf(object.body), 'Content-Range': `bytes ${range[1]}-${range[1] + part.length - 1}/${object.body.length}` });
      return res.end(part);
    }
    res.writeHead(200, { 'Content-Length': object.body.length, 'Content-Type': object.type, ETag: etagOf(object.body) });
    for (let at = 0; at < object.body.length; at += 65536) res.write(object.body.subarray(at, at + 65536)); // streamed in pieces
    return res.end();
  }
  res.writeHead(405);
  return res.end();
});
await new Promise((resolve) => fakeServer.listen(0, '127.0.0.1', resolve));
fake.port = fakeServer.address().port;
process.env.R2_ENDPOINT = `http://127.0.0.1:${fake.port}`;

// Cloudinary stays reachable only as a recorded fake
const cloudinaryCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (url.startsWith('https://api.cloudinary.com/')) {
    cloudinaryCalls.push(url);
    return Promise.resolve(new Response(JSON.stringify({ result: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return realFetch(input, init);
};

// ====================================================================== in-memory stand-in for MongoDB (Portfolio + User only)
const db = { portfolio: [], users: [] };
const tick = () => new Promise((r) => setImmediate(r));
const dupKey = (keyValue) => Object.assign(new Error('E11000 duplicate key error'), { code: 11000, keyValue });
const plain = (v) => {
  if (v === null || v === undefined || v instanceof Date || v instanceof RegExp) return v;
  if (v._bsontype === 'ObjectId') return String(v);
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') {
    if (typeof v.toObject === 'function') return plain(v.toObject());
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
};
const matches = (row, filter) => new Query(plain(filter ?? {})).test(row);
const compare = (a, b) => { const x = a instanceof Date ? +a : a; const y = b instanceof Date ? +b : b; if (x == null && y == null) return 0; if (x == null) return -1; if (y == null) return 1; return x < y ? -1 : x > y ? 1 : 0; };
const sortRows = (rows, sort) => (!sort ? rows : [...rows].sort((a, b) => { for (const [k, dir] of Object.entries(sort)) { const c = compare(a[k], b[k]); if (c) return c * dir; } return 0; }));
const query = (run) => {
  const state = {};
  const q = {
    sort(s) { state.sort = s; return q; }, select() { return q; }, limit(n) { state.limit = n; return q; }, lean() { state.lean = true; return q; },
    then(res, rej) { return tick().then(() => run(state)).then(res, rej); },
  };
  return q;
};
const keyOf = (row) => (typeof row.image?.key === 'string' ? row.image.key : null);
const rows = db.portfolio;
const attach = (doc) => {
  doc.save = async function save() {
    await this.validate();
    const raw = plain(this.toObject());
    const i = rows.findIndex((r) => r._id === raw._id);
    // the partial unique index on image.key: only rows that HAVE a string key take part
    if (keyOf(raw) && rows.some((r) => r._id !== raw._id && keyOf(r) === keyOf(raw))) throw dupKey({ 'image.key': keyOf(raw) });
    raw.updatedAt = new Date();
    if (i === -1) rows.push({ createdAt: new Date(), ...raw }); else Object.assign(rows[i], raw);
    return this;
  };
  doc.deleteOne = async function deleteOne() { const i = rows.findIndex((r) => r._id === String(this._id)); if (i !== -1) rows.splice(i, 1); return { deletedCount: 1 }; };
  return doc;
};
Portfolio.prototype.save = function saveNew() { attach(this); return this.save(); };
const open = (row, state) => (state.lean ? structuredClone(row) : attach(Portfolio.hydrate(structuredClone(row))));
Portfolio.findOne = (filter) => query((s) => { const row = sortRows(rows.filter((r) => matches(r, filter)), s.sort)[0]; return row ? open(row, s) : null; });
Portfolio.findById = (id) => Portfolio.findOne({ _id: String(id) });
Portfolio.find = (filter) => query((s) => sortRows(rows.filter((r) => matches(r, filter)), s.sort).slice(0, s.limit ?? Infinity).map((r) => open(r, s)));
Portfolio.updateMany = async (filter, update) => {
  await tick();
  let n = 0;
  rows.filter((r) => matches(r, filter)).forEach((r) => { Object.assign(r, plain(update.$set ?? {})); n += 1; });
  return { matchedCount: n, modifiedCount: n };
};
const admin = { _id: String(new mongoose.Types.ObjectId()), role: 'admin', tokenVersion: 0 };
const other = { _id: String(new mongoose.Types.ObjectId()), role: 'admin', tokenVersion: 0 };
const customer = { _id: String(new mongoose.Types.ObjectId()), role: 'user', tokenVersion: 0 };
db.users.push(admin, other, customer);
User.findById = async (id) => db.users.find((u) => u._id === String(id)) ?? null;
void Aggregator; // (kept for parity with the other test scripts)

// ====================================================================== the app under test + a tiny HTTP client
const app = express();
let biggestApiBody = 0;
// The routes carry their own rate limiter (60 upload calls per 10 minutes). This test makes more calls than that in total, so every
// test gets a FRESH copy of the route module (and so a fresh limiter); only the last test checks the limit itself.
let currentRoutes = portfolioRoutes;
let routeCopies = 0;
const freshRoutes = async () => { routeCopies += 1; currentRoutes = (await import(`../routes/portfolioRoutes.js?copy=${routeCopies}`)).default; };
app.use((req, res, next) => { biggestApiBody = Math.max(biggestApiBody, Number(req.headers['content-length'] || 0)); next(); });
app.use(express.json({ limit: '10kb' })); // exactly like server.js: a photo could never fit through here
app.use('/api/portfolio', (req, res, next) => currentRoutes(req, res, next));
app.use(notFound);
app.use(errorHandler);
const apiServer = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const API = `http://127.0.0.1:${apiServer.address().port}/api/portfolio`;
const bearer = (u) => `Bearer ${signToken(u._id, 0)}`;
const seenBodies = []; // everything the API said, to scan for leaks
async function api(method, path, { as = admin, body } = {}) {
  const res = await realFetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(as ? { authorization: bearer(as) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  seenBodies.push(text);
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, text };
}
/** What the browser does with the answer of POST /uploads: send the file straight to R2. */
const browserPut = (prepared, bytes, headers = prepared.headers) => realFetch(prepared.uploadUrl, { method: prepared.method, headers, body: bytes });

// ====================================================================== synthetic pictures (structurally valid; not decodable, which the validator does not need)
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }
const le32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };

// Small files written by real encoders (Pillow), 24x16 pixels
const REAL = {
  jpegBaseline: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAQABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDioNO6fLWjBpvT5a3bbTuny1q22mdPlrjpT9qc+EzK3U56DS+ny0V2MdisZA25b0oqpzwsJcs5a+jf5I+lo5lJx0P/2Q==', 'base64'),
  jpegProgressive: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wgARCAAQABgDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABAUA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAwEF/9oADAMBAAIQAxAAAAGIlyxOdrOul//EABgQAAMBAQAAAAAAAAAAAAAAAAABAwIR/9oACAEBAAEFAlMUxSMzMzFjh//EABkRAAIDAQAAAAAAAAAAAAAAAAAEAQIDEf/aAAgBAwEBPwHJkozPD//EABkRAQACAwAAAAAAAAAAAAAAAAEAAgMREv/aAAgBAgEBPwGr1FxDpZ//xAAUEAEAAAAAAAAAAAAAAAAAAAAg/9oACAEBAAY/Al//xAAYEAEBAAMAAAAAAAAAAAAAAAAAYQEhQf/aAAgBAQABPyGSaSCLDxt//9oADAMBAAIAAwAAABCjH//EABgRAAIDAAAAAAAAAAAAAAAAAAABESFB/9oACAEDAQE/EItGKH//xAAYEQACAwAAAAAAAAAAAAAAAAAAATFxsf/aAAgBAgEBPxA86VN4j//EABgQAQEBAQEAAAAAAAAAAAAAAAAxASFR/9oACAEBAAE/EJkiRMmaGZ14f//Z', 'base64'),
  jpegRotated: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAQABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDioNO6fLWjBpvT5a3bbTuny1q22mdPlrjpT9qc+EzK3U56DS+ny0V2MdisZA25b0oqpzwsJcs5a+jf5I+lo5lJx0P/2Q==', 'base64'),
  png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAAaElEQVR4Xq3SuQ6AIBBF0YvivlBo/P9PtUPiAjNgcoqXKW41Bhj/YHGAKedDFWXCUE2BW8iS6xlqyPIaatH7CnUoRUI9GvHQgFgyJH17SWhCQBiaSZGHFj4dsKhCK3e7v2hDjssWbHcC1VkKsJl67m4AAAAASUVORK5CYII=', 'base64'),
  pngPalette: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAQBAMAAAD+CqKmAAAAMFBMVEXI0mHIrcGHw7Ay0kYyrTrIgKqHgHNLgEAUgBHIRFqHRD3IDxSHDw5LRCIURAkyDwVRYJNXAAAAc0lEQVR4Xk2P0Q2DMAxEH8F7dIXOyy6oWaASG7BB4wEMqc6hFVY+7pSXy3nqAG/oDkX6N6UB5+Wmj464ltgJx7j6v1HQMBs4hC1Jt8wuCBBz/0feYJ2fDh4VIzi2R9RRp0JEVWazUMyeGnv5VaxDkc41HL5uODFAjBS6jgAAAABJRU5ErkJggg==', 'base64'),
  webpLossy: Buffer.from('UklGRoQAAABXRUJQVlA4IHgAAADQAwCdASoYABAAPrVMnkmnJKKhMAgA4BaJbACdMoRwN4ABLgXBsYAA/v6/dRjYmccbCxkWhMDy3jpi9n47WLFMIWdiN0fQb9+fc678pf/aX84rvRUR3+7tIrz1Cci2xxe9rwe361skHI6bX9eGv9Q6XqmtLx4SQAA=', 'base64'),
  webpLossless: Buffer.from('UklGRkgAAABXRUJQVlA4TDsAAAAvF8ADALkyRPQ/FuNf/+h/JA4jbSPVwft3fPDh4CgobhtJzS3vHn/5YgIS1wfB9ReQRmj8DYVZEwavCgA=', 'base64'),
};

// ---- JPEG
const seg = (marker, body) => Buffer.concat([Buffer.from([0xff, marker]), u16(body.length + 2), body]);
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const sofBody = (w, h, comps = 3, precision = 8) => Buffer.concat([Buffer.from([precision]), u16(h), u16(w), Buffer.from([comps]), ...Array.from({ length: comps }, (_, i) => Buffer.from([i + 1, 0x11, 0]))]);
const sosBody = (comps = 3) => Buffer.concat([Buffer.from([comps]), ...Array.from({ length: comps }, (_, i) => Buffer.from([i + 1, 0x00])), Buffer.from([0, 63, 0])]);
/** entropy-coded data as a real scan has it: stuffed FF 00, a restart marker, fill bytes, and long runs of data without any marker */
const scanData = (n = 100) => Buffer.concat([Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xff, 0x00]), Buffer.alloc(n, 0x55)]);
function exifSegment(orientation, order = 'MM') {
  const le = order === 'II';
  const w16 = (n) => { const b = Buffer.alloc(2); if (le) b.writeUInt16LE(n); else b.writeUInt16BE(n); return b; };
  const w32 = (n) => { const b = Buffer.alloc(4); if (le) b.writeUInt32LE(n); else b.writeUInt32BE(n); return b; };
  const tiff = Buffer.concat([Buffer.from(order), w16(42), w32(8), w16(1), w16(0x0112), w16(3), w32(1), w16(orientation), w16(0), w32(0)]);
  return seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]));
}
/**
 * A JPEG with the usual structure: SOI, EXIF, JFIF, metadata, frame header, scan(s), EOI.
 * metadataBytes: extra metadata in front of the picture (APP13 / ICC / XMP segments of 60000 bytes), like a camera or Lightroom writes.
 * totalBytes: pad the picture data to this file size. trailer: bytes appended after the end marker.
 */
function makeJpeg({ width, height, orientation, order, metadataBytes = 0, totalBytes = 0, trailer, progressive = false }) {
  const head = [SOI];
  if (orientation) head.push(exifSegment(orientation, order));
  head.push(seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')));
  const kinds = [() => seg(0xed, Buffer.alloc(60000, 0x41)), () => seg(0xe2, Buffer.concat([Buffer.from('ICC_PROFILE\0\x01\x01', 'latin1'), Buffer.alloc(59980, 0x42)])), () => seg(0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.alloc(59900, 0x43)]))];
  for (let left = metadataBytes, i = 0; left > 0; left -= 60000, i += 1) head.push(kinds[i % kinds.length]());
  head.push(seg(0xdb, Buffer.alloc(65, 1)), seg(progressive ? 0xc2 : 0xc0, sofBody(width, height)));
  const build = (pad) => {
    const parts = [...head];
    const scans = progressive ? 3 : 1;
    for (let s = 0; s < scans; s += 1) {
      if (progressive) parts.push(seg(0xc4, Buffer.alloc(20, 1)));
      parts.push(seg(0xda, sosBody()), scanData(s === scans - 1 ? pad : 0));
    }
    return Buffer.concat([...parts, EOI]); // the picture data is padded so that the file (without any trailer) is exactly totalBytes
  };
  const base = build(0);
  const file = totalBytes > base.length ? build(totalBytes - base.length) : base;
  return trailer ? Buffer.concat([file, trailer]) : file;
}

// ---- PNG
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crcOf = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const pngChunk = (type, data = Buffer.alloc(0), { badCrc = false } = {}) => { const body = Buffer.concat([Buffer.from(type, 'latin1'), data]); return Buffer.concat([u32(data.length), body, u32((crcOf(body) ^ (badCrc ? 1 : 0)) >>> 0)]); };
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = (w, h, depth = 8, colour = 2) => { const b = Buffer.alloc(13); b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b.set([depth, colour, 0, 0, 0], 8); return b; };
function makePng(width, height, totalBytes = 0, { colour = 2, depth = 8 } = {}) {
  const parts = [PNG_SIG, pngChunk('IHDR', ihdr(width, height, depth, colour))];
  if (colour === 3) parts.push(pngChunk('PLTE', Buffer.alloc(6, 7)));
  const used = parts.reduce((n, p) => n + p.length, 0) + 24; // + the IDAT and IEND chunk overhead
  parts.push(pngChunk('IDAT', Buffer.alloc(Math.max(8, totalBytes - used), 0x33)), pngChunk('IEND'));
  return Buffer.concat(parts);
}

// ---- WebP
const webpChunk = (fourcc, payload) => Buffer.concat([Buffer.from(fourcc, 'latin1'), le32(payload.length), payload, Buffer.alloc(payload.length & 1)]);
const riffOf = (...chunks) => { const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]); return Buffer.concat([Buffer.from('RIFF'), le32(body.length), body]); };
const vp8Payload = (w, h, extra = 0) => { const p = Buffer.alloc(10 + extra, 0x11); p.set([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a], 0); p.writeUInt16LE(w, 6); p.writeUInt16LE(h, 8); return p; };
const vp8lPayload = (w, h, extra = 0) => { const p = Buffer.alloc(5 + extra, 0x22); p[0] = 0x2f; p.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0, 1); return p; };
const vp8xPayload = (w, h, flags = 0) => { const p = Buffer.alloc(10); p[0] = flags; p.writeUIntLE(w - 1, 4, 3); p.writeUIntLE(h - 1, 7, 3); return p; };
const makeWebpLossy = (w, h, extra = 0) => riffOf(webpChunk('VP8 ', vp8Payload(w, h, extra)));
const makeWebpLossless = (w, h, extra = 0) => riffOf(webpChunk('VP8L', vp8lPayload(w, h, extra)));
const makeWebpExtended = (w, h, extra = 0) => riffOf(webpChunk('VP8X', vp8xPayload(w, h)), webpChunk('ICCP', Buffer.alloc(33, 1)), webpChunk('VP8 ', vp8Payload(w, h, extra)), webpChunk('EXIF', Buffer.alloc(21, 2)));

// ====================================================================== helpers for the API tests
const reset = async () => {
  await freshRoutes();
  resetFake(); rows.length = 0; cloudinaryCalls.length = 0;
  process.env.IMAGE_STORAGE_PROVIDER = 'r2';
  process.env.R2_BUCKET = BUCKET;
  delete process.env.R2_MAX_UPLOAD_MB;
};
/** the whole happy path up to (not including) finalize; returns what the browser would hold */
async function prepareAndUpload(bytes, contentType = 'image/jpeg', { announcedSize = bytes.length } = {}) {
  const prepared = await api('POST', '/uploads', { body: { contentType, size: announcedSize } });
  assert.equal(prepared.status, 201, prepared.text);
  const put = await browserPut(prepared.data.data, bytes);
  return { prepared: prepared.data.data, put };
}
const finalize = (token, fields = {}, as = admin) => api('POST', '/uploads/finalize', { as, body: { token, title: 'First dance', category: 'wedding', ...fields } });
const mb = (n) => n * 1024 * 1024;

// ====================================================================== 1  the signature check itself
section('the fake R2 verifies signatures with an independent implementation (checked against AWS\'s published examples)');
await test('AWS published example 1 (presigned GET) gives the published signature', () => {
  const q = new URLSearchParams('X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host');
  const sig = sigV4({
    method: 'GET', pathname: '/test.txt', searchParams: q, headers: { host: 'examplebucket.s3.amazonaws.com' }, signedHeaders: ['host'],
    payloadHash: 'UNSIGNED-PAYLOAD', amzDate: '20130524T000000Z', region: 'us-east-1', service: 's3', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });
  assert.equal(sig, 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});
await test('AWS published example 2 (GET Object with a Range header) gives the published signature', () => {
  const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const sig = sigV4({
    method: 'GET', pathname: '/test.txt', searchParams: new URLSearchParams(),
    headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': emptyHash, 'x-amz-date': '20130524T000000Z' },
    signedHeaders: ['host', 'range', 'x-amz-content-sha256', 'x-amz-date'], payloadHash: emptyHash, amzDate: '20130524T000000Z', region: 'us-east-1', service: 's3',
    secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });
  assert.equal(sig, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

// ====================================================================== 2  image validator
section('image validator: only COMPLETE, well-formed JPEG / PNG / WebP files pass; real size is always known');
const chunked = (buf, size) => (async function* pieces() { for (let at = 0; at < buf.length; at += size) yield buf.subarray(at, at + size); }());
const verdict = (buf, type) => inspectImage(buf, type);
const refuses = async (buf, type, reason, label) => {
  const r = await verdict(buf, type);
  assert.equal(r.ok, false, `${label}: the file was ACCEPTED`);
  if (reason) assert.equal(r.reason, reason, label);
};
const dims = (r) => [r.ok, r.width, r.height];

await test('files written by real encoders are accepted with the right size: JPEG, progressive JPEG, EXIF-rotated JPEG (turned as a visitor sees it), PNG, palette PNG, WebP lossy and lossless', async () => {
  assert.deepEqual(dims(await verdict(REAL.jpegBaseline, 'image/jpeg')), [true, 24, 16]);
  assert.deepEqual(dims(await verdict(REAL.jpegProgressive, 'image/jpeg')), [true, 24, 16]);
  assert.deepEqual(dims(await verdict(REAL.jpegRotated, 'image/jpeg')), [true, 16, 24]);
  assert.deepEqual(dims(await verdict(REAL.png, 'image/png')), [true, 24, 16]);
  assert.deepEqual(dims(await verdict(REAL.pngPalette, 'image/png')), [true, 24, 16]);
  assert.deepEqual(dims(await verdict(REAL.webpLossy, 'image/webp')), [true, 24, 16]);
  assert.deepEqual(dims(await verdict(REAL.webpLossless, 'image/webp')), [true, 24, 16]);
});
await test('structurally valid files of every kind are accepted: JPEG with stuffed bytes and restart markers, progressive JPEG with several scans, PNG, the three WebP kinds', async () => {
  assert.deepEqual(dims(await verdict(makeJpeg({ width: 6000, height: 4000 }), 'image/jpeg')), [true, 6000, 4000]);
  assert.deepEqual(dims(await verdict(makeJpeg({ width: 6000, height: 4000, progressive: true, totalBytes: 200000 }), 'image/jpeg')), [true, 6000, 4000]);
  assert.deepEqual(dims(await verdict(makePng(1920, 1080, 5000), 'image/png')), [true, 1920, 1080]);
  assert.deepEqual(dims(await verdict(makePng(100, 100, 400, { colour: 3, depth: 4 }), 'image/png')), [true, 100, 100]);
  assert.deepEqual(dims(await verdict(makeWebpLossy(3000, 2000, 7), 'image/webp')), [true, 3000, 2000]); // an odd-sized chunk is padded
  assert.deepEqual(dims(await verdict(makeWebpLossless(3000, 2000), 'image/webp')), [true, 3000, 2000]);
  assert.deepEqual(dims(await verdict(makeWebpExtended(3000, 2000), 'image/webp')), [true, 3000, 2000]);
});
await test('EXIF orientation 5-8 (shot upright, stored sideways) is reported as a visitor sees it (width and height swapped); 1-4 and no EXIF are not', async () => {
  for (const [o, order] of [[6, 'MM'], [8, 'II'], [5, 'MM'], [7, 'II']]) assert.deepEqual(dims(await verdict(makeJpeg({ width: 6000, height: 4000, orientation: o, order }), 'image/jpeg')), [true, 4000, 6000], `orientation ${o}`);
  for (const o of [1, 2, 3, 4]) assert.deepEqual(dims(await verdict(makeJpeg({ width: 6000, height: 4000, orientation: o }), 'image/jpeg')), [true, 6000, 4000], `orientation ${o}`);
});
await test('a camera JPEG with LARGE metadata is accepted: 1.4 MB of EXIF / Photoshop / ICC / XMP in front of the picture (far beyond the first 512 KB), orientation still applied', async () => {
  const big = makeJpeg({ width: 6000, height: 4000, orientation: 6, metadataBytes: 1_400_000, totalBytes: 2_000_000 });
  assert.ok(big.indexOf(Buffer.from([0xff, 0xc0, 0x00, 0x11])) > 1_300_000, 'the frame header must really sit behind more than a megabyte of metadata');
  assert.deepEqual(dims(await verdict(big, 'image/jpeg')), [true, 4000, 6000]);
  assert.deepEqual(dims(await verdict(chunked(big, 16384), 'image/jpeg')), [true, 4000, 6000]);
});
await test('a JPEG with data appended after its end marker (phone "motion photo" video, vendor trailer) is accepted: the picture is complete', async () => {
  const trailer = Buffer.concat([Buffer.from('ftypmp42'), Buffer.alloc(3_000_000, 0xff), Buffer.from([0xff, 0xd9, 0xff, 0xd9])]);
  assert.deepEqual(dims(await verdict(makeJpeg({ width: 4000, height: 3000, trailer }), 'image/jpeg')), [true, 4000, 3000]);
});

await test('a TRUNCATED JPEG is refused wherever it is cut: every cut of two real files, and the critical cuts of a big camera-style file', async () => {
  for (const file of [REAL.jpegBaseline, REAL.jpegProgressive, REAL.jpegRotated]) {
    for (let n = 0; n < file.length; n += 1) {
      const r = await verdict(file.subarray(0, n), 'image/jpeg');
      assert.equal(r.ok, false, `cut at ${n} of ${file.length} was accepted`);
    }
  }
  const big = makeJpeg({ width: 6000, height: 4000, orientation: 6, metadataBytes: 700_000, totalBytes: 1_500_000 });
  const sof = big.indexOf(Buffer.from([0xff, 0xc0, 0x00, 0x11]));
  for (const n of [3, 100, 70_000, 400_000, sof, sof + 10, sof + 19, sof + 40, big.length / 2, big.length - 3, big.length - 2, big.length - 1]) {
    const r = await verdict(big.subarray(0, Math.floor(n)), 'image/jpeg');
    assert.equal(r.ok, false, `cut at ${n} of ${big.length} was accepted`);
    assert.equal(r.reason, 'incomplete', `cut at ${n}`);
  }
  assert.equal((await verdict(big, 'image/jpeg')).ok, true, 'the whole file must pass');
});
await test('malformed JPEG structure is refused: no frame header, no scan, zero size, wrong component count, bad segment length, a missing marker, a second frame, a bad scan header, a nested SOI', async () => {
  const sof = seg(0xc0, sofBody(100, 100));
  const sos = seg(0xda, sosBody());
  const good = Buffer.concat([SOI, sof, sos, scanData(), EOI]);
  assert.equal((await verdict(good, 'image/jpeg')).ok, true);
  const cases = {
    'a scan before any frame header': Buffer.concat([SOI, sos, scanData(), EOI]),
    'no scan at all': Buffer.concat([SOI, sof, EOI]),
    'no frame header at all': Buffer.concat([SOI, seg(0xe0, Buffer.alloc(14)), EOI]),
    'width 0': Buffer.concat([SOI, seg(0xc0, sofBody(0, 100)), sos, scanData(), EOI]),
    'height 0': Buffer.concat([SOI, seg(0xc0, sofBody(100, 0)), sos, scanData(), EOI]),
    'frame header with 5 components but room for 3': Buffer.concat([SOI, seg(0xc0, Buffer.concat([sofBody(100, 100, 3).subarray(0, 5), Buffer.from([5]), Buffer.alloc(9)])), sos, scanData(), EOI]),
    'precision 4': Buffer.concat([SOI, seg(0xc0, sofBody(100, 100, 3, 4)), sos, scanData(), EOI]),
    'a segment length of 1': Buffer.concat([SOI, Buffer.from([0xff, 0xe0, 0x00, 0x01]), sof, sos, scanData(), EOI]),
    'a stray byte between segments': Buffer.concat([SOI, sof, Buffer.from([0x41]), sos, scanData(), EOI]),
    'FF 00 between segments': Buffer.concat([SOI, sof, Buffer.from([0xff, 0x00]), sos, scanData(), EOI]),
    'a second frame header': Buffer.concat([SOI, sof, sof, sos, scanData(), EOI]),
    'a scan header of the wrong length': Buffer.concat([SOI, sof, seg(0xda, sosBody().subarray(0, 5)), scanData(), EOI]),
    'a scan with 0 components': Buffer.concat([SOI, sof, seg(0xda, Buffer.from([0, 0, 63, 0])), scanData(), EOI]),
    'an SOI inside the file': Buffer.concat([SOI, sof, SOI, sos, scanData(), EOI]),
  };
  for (const [label, buf] of Object.entries(cases)) await refuses(buf, 'image/jpeg', 'malformed', label);
  await refuses(Buffer.concat([SOI, Buffer.from([0xff, 0xe0, 0xff, 0xff]), Buffer.alloc(100)]), 'image/jpeg', 'incomplete', 'a segment that claims to be longer than the file');
  await refuses(Buffer.concat([SOI, sof, sos, scanData()]), 'image/jpeg', 'incomplete', 'scan data that never ends (no end marker)');
});
await test('JPEG kinds browsers cannot show (lossless, arithmetic coded) are refused as unsupported, with a clear reason', async () => {
  for (const marker of [0xc3, 0xc9, 0xca]) await refuses(Buffer.concat([SOI, seg(marker, sofBody(100, 100)), seg(0xda, sosBody()), scanData(), EOI]), 'image/jpeg', 'unsupported', `SOF ${marker.toString(16)}`);
});

await test('a truncated or altered PNG is refused: every cut of two real files, and EVERY single changed byte of both (each byte is covered by a length, a signature or a checksum)', async () => {
  for (const file of [REAL.png, REAL.pngPalette]) {
    for (let n = 0; n < file.length; n += 1) assert.equal((await verdict(file.subarray(0, n), 'image/png')).ok, false, `cut at ${n} of ${file.length} was accepted`);
    for (let at = 0; at < file.length; at += 1) {
      for (const flip of [0x01, 0x80]) {
        const damaged = Buffer.from(file); damaged[at] ^= flip;
        assert.equal((await verdict(damaged, 'image/png')).ok, false, `byte ${at} changed by ${flip} was accepted`);
      }
    }
  }
});
await test('malformed PNG headers are refused: signature, IHDR position/length/size/colour type/bit depth/checksum, checksum of the data, missing data or end chunk, bad chunk names', async () => {
  const idat = pngChunk('IDAT', Buffer.alloc(20, 1));
  const iend = pngChunk('IEND');
  const header = (w = 100, h = 100, d = 8, c = 2) => pngChunk('IHDR', ihdr(w, h, d, c));
  const good = Buffer.concat([PNG_SIG, header(), idat, iend]);
  assert.equal((await verdict(good, 'image/png')).ok, true);
  const bad = {
    'IHDR is not the first chunk': Buffer.concat([PNG_SIG, pngChunk('tEXt', Buffer.alloc(5)), header(), idat, iend]),
    'IHDR twice': Buffer.concat([PNG_SIG, header(), header(), idat, iend]),
    'IHDR of 12 bytes': Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr(100, 100).subarray(0, 12)), idat, iend]),
    'width 0': Buffer.concat([PNG_SIG, header(0, 100), idat, iend]),
    'height 0': Buffer.concat([PNG_SIG, header(100, 0), idat, iend]),
    'colour type 9': Buffer.concat([PNG_SIG, header(100, 100, 8, 9), idat, iend]),
    'bit depth 7': Buffer.concat([PNG_SIG, header(100, 100, 7, 2), idat, iend]),
    'bit depth 16 with a palette': Buffer.concat([PNG_SIG, header(100, 100, 16, 3), pngChunk('PLTE', Buffer.alloc(6)), idat, iend]),
    'a wrong IHDR checksum': Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr(100, 100), { badCrc: true }), idat, iend]),
    'a wrong checksum in the picture data': Buffer.concat([PNG_SIG, header(), pngChunk('IDAT', Buffer.alloc(20, 1), { badCrc: true }), iend]),
    'no picture data': Buffer.concat([PNG_SIG, header(), iend]),
    'a palette picture without a palette': Buffer.concat([PNG_SIG, header(100, 100, 8, 3), idat, iend]),
    'an end chunk with content': Buffer.concat([PNG_SIG, header(), idat, pngChunk('IEND', Buffer.alloc(4))]),
    'a chunk name with a digit': Buffer.concat([PNG_SIG, header(), pngChunk('ID4T', Buffer.alloc(3)), idat, iend]),
    'a chunk length of 3 GB': Buffer.concat([PNG_SIG, header(), Buffer.from([0xc0, 0, 0, 0]), Buffer.from('IDAT'), Buffer.alloc(40), iend]),
  };
  for (const [label, buf] of Object.entries(bad)) await refuses(buf, 'image/png', 'malformed', label);
  await refuses(Buffer.concat([PNG_SIG, header(), idat]), 'image/png', 'incomplete', 'no end chunk (cut off)');
  await refuses(Buffer.concat([PNG_SIG, header(70000, 100), idat, iend]), 'image/png', 'too_large', 'a side of 70000 pixels');
  await refuses(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x00, 0x0a, ...makePng(10, 10).subarray(8)]), 'image/png', 'not_an_image', 'a damaged signature');
});

await test('a truncated WebP is refused wherever it is cut (every cut of the two real files, and of an extended file)', async () => {
  for (const file of [REAL.webpLossy, REAL.webpLossless, makeWebpExtended(300, 200, 40)]) {
    for (let n = 0; n < file.length; n += 1) assert.equal((await verdict(file.subarray(0, n), 'image/webp')).ok, false, `cut at ${n} of ${file.length} was accepted`);
  }
  await refuses(makeWebpLossy(300, 200, 5000).subarray(0, 3000), 'image/webp', 'incomplete', 'a cut-off upload (the container says it is longer)');
});
await test('malformed WebP headers are refused: container size, first chunk, start code, frame type, zero size, lossless signature, overlong chunk, no picture, canvas that disagrees, stray bytes', async () => {
  assert.equal((await verdict(makeWebpLossy(300, 200), 'image/webp')).ok, true);
  const patch = (buf, at, bytes) => { const copy = Buffer.from(buf); Buffer.from(bytes).copy(copy, at); return copy; };
  const lossy = makeWebpLossy(300, 200);
  const cases = {
    'a container too small to hold a chunk': patch(lossy, 4, [4, 0, 0, 0]),
    'an unknown first chunk': patch(lossy, 12, Buffer.from('JUNK')),
    'a wrong start code': patch(lossy, 20 + 3, [0x9d, 0x01, 0x2b]),
    'a frame that is not a key frame': patch(lossy, 20, [0x11]),
    'width 0': patch(lossy, 20 + 6, [0, 0]),
    'a lossless header without the 0x2f signature': patch(makeWebpLossless(300, 200), 20, [0x2e]),
    'a chunk longer than the container': patch(lossy, 16, [0xff, 0xff, 0x00, 0x00]),
    'an extended header without any picture': riffOf(webpChunk('VP8X', vp8xPayload(300, 200)), webpChunk('EXIF', Buffer.alloc(8))),
    'an extended header shorter than 10 bytes': riffOf(webpChunk('VP8X', Buffer.alloc(6)), webpChunk('VP8 ', vp8Payload(300, 200))),
    'a canvas size that disagrees with the picture': riffOf(webpChunk('VP8X', vp8xPayload(999, 200)), webpChunk('VP8 ', vp8Payload(300, 200))),
    'a stray bytes after the last chunk, inside the container': riffOf(webpChunk('VP8 ', vp8Payload(300, 200)), Buffer.alloc(3)),
  };
  for (const [label, buf] of Object.entries(cases)) await refuses(buf, 'image/webp', 'malformed', label);
  await refuses(patch(lossy, 4, [0xff, 0xff, 0xff, 0x7f]), 'image/webp', 'incomplete', 'a container that claims 2 GB');
});

await test('the verdict does not depend on how the stream is cut into pieces (1, 7 or 65536 bytes) for any real, valid or damaged file', async () => {
  const files = [
    [REAL.jpegBaseline, 'image/jpeg'], [REAL.jpegProgressive, 'image/jpeg'], [REAL.jpegRotated, 'image/jpeg'], [REAL.png, 'image/png'], [REAL.pngPalette, 'image/png'],
    [REAL.webpLossy, 'image/webp'], [REAL.webpLossless, 'image/webp'], [makeWebpExtended(300, 200), 'image/webp'], [makePng(640, 480, 3000), 'image/png'],
    [makeJpeg({ width: 800, height: 600, orientation: 8, metadataBytes: 150_000, totalBytes: 300_000, progressive: true }), 'image/jpeg'],
    [REAL.jpegBaseline.subarray(0, 300), 'image/jpeg'], [REAL.png.subarray(0, 100), 'image/png'], [REAL.webpLossy.subarray(0, 60), 'image/webp'],
    [Buffer.concat([SOI, seg(0xc0, sofBody(0, 5)), EOI]), 'image/jpeg'],
  ];
  for (const [file, type] of files) {
    const whole = await verdict(file, type);
    for (const size of [1, 7, 65536]) assert.deepEqual(await verdict(chunked(file, size), type), whole, `${type}, ${file.length} bytes, pieces of ${size}`);
  }
});
await test('a file that is not what it announces is refused: PNG announced as JPEG, a JPEG announced as WebP, text, an empty file, a GIF, a non-buffer', async () => {
  await refuses(makePng(10, 10, 100), 'image/jpeg', 'type_mismatch', 'png as jpeg');
  await refuses(makeJpeg({ width: 10, height: 10 }), 'image/webp', 'type_mismatch', 'jpeg as webp');
  await refuses(Buffer.from('<html>hello</html>'), 'image/jpeg', 'not_an_image', 'html');
  await refuses(Buffer.alloc(0), 'image/png', 'not_an_image', 'empty');
  await refuses(Buffer.from('GIF89a......'), 'image/png', 'not_an_image', 'gif');
  await refuses('not a buffer', 'image/png', 'not_an_image', 'string');
  await refuses(null, 'image/png', 'not_an_image', 'null');
  assert.equal(sniffType(Buffer.from('GIF89a......')), null);
});
await test('a stream that delivers MORE bytes than the storage announced is refused as "changed"; a failing source is rethrown (the network\'s fault is never blamed on the file)', async () => {
  const file = makeJpeg({ width: 800, height: 600, totalBytes: 100_000 });
  assert.equal((await inspectImage(chunked(file, 4096), 'image/jpeg', { maxBytes: file.length })).ok, true);
  const tooMuch = await inspectImage(chunked(Buffer.concat([file, Buffer.alloc(50_000)]), 4096), 'image/jpeg', { maxBytes: file.length });
  assert.deepEqual([tooMuch.ok, tooMuch.reason], [false, 'changed']);
  const failing = (async function* broken() { yield file.subarray(0, 5000); throw new Error('connection reset'); }());
  await assert.rejects(() => inspectImage(failing, 'image/jpeg'), /connection reset/);
});
await test('the source is released as soon as the verdict is known, so a refused or finished file does not keep a connection open', async () => {
  let released = 0;
  const watched = (buf) => (async function* gen() { try { for (let at = 0; at < buf.length; at += 1000) yield buf.subarray(at, at + 1000); } finally { released += 1; } }());
  await verdict(watched(Buffer.from('<html>'.padEnd(5000, 'x'))), 'image/jpeg');
  await verdict(watched(makeJpeg({ width: 10, height: 10, trailer: Buffer.alloc(8000) })), 'image/jpeg'); // stops at the end marker
  await verdict(watched(makePng(10, 10, 4000).subarray(0, 2000)), 'image/png');
  assert.equal(released, 3);
});
await test('the CRC fallback equals the standard check value, and a damaged file of any kind never makes the validator throw (4000 random cuts and changed bytes)', async () => {
  assert.equal(crc32Js(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32Js(Buffer.from('6789'), crc32Js(Buffer.from('12345'))), 0xcbf43926, 'running value over two pieces');
  const base = [[REAL.jpegBaseline, 'image/jpeg'], [REAL.jpegProgressive, 'image/jpeg'], [REAL.png, 'image/png'], [REAL.webpLossy, 'image/webp'], [REAL.webpLossless, 'image/webp'], [makeWebpExtended(50, 50), 'image/webp'], [makePng(30, 30, 600), 'image/png']];
  for (let i = 0; i < 4000; i += 1) {
    const [src, type] = base[i % base.length];
    const copy = Buffer.from(src.subarray(0, i % 3 === 0 ? Math.floor(Math.random() * src.length) : src.length));
    for (let k = 0; k < 1 + (i % 4); k += 1) if (copy.length) copy[Math.floor(Math.random() * copy.length)] = Math.floor(Math.random() * 256);
    const r = await verdict(copy, type); // must not throw
    assert.equal(typeof r.ok, 'boolean');
    if (r.ok) assert.ok(Number.isInteger(r.width) && Number.isInteger(r.height) && r.width > 0 && r.height > 0, 'an accepted file always has a real size');
  }
});

// ====================================================================== 3  upload token
section('upload token: the server\'s signed note about one upload');
await test('a token round-trips: key, type and size come back; it only works for the admin it was made for', () => {
  const token = createIntent({ key: 'portfolio/2026/11/' + 'a'.repeat(32) + '.jpg', type: 'image/jpeg', size: 1234, adminId: admin._id });
  assert.deepEqual(verifyIntent(token, admin._id), { key: 'portfolio/2026/11/' + 'a'.repeat(32) + '.jpg', type: 'image/jpeg', size: 1234 });
  assert.throws(() => verifyIntent(token, other._id), /not valid/);
});
await test('a changed, cut, empty, oversized or foreign token is refused; so is an expired one', () => {
  const token = createIntent({ key: 'portfolio/2026/11/' + 'b'.repeat(32) + '.jpg', type: 'image/jpeg', size: 10, adminId: admin._id });
  const [body, sig] = token.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), s: 99999999 })).toString('base64url');
  for (const bad of [`${forgedBody}.${sig}`, `${body}.${sig.slice(0, -2)}AA`, body, `${body}.`, '', '.', 'x.y.z', `${body}.${'A'.repeat(2000)}`, 12345, null, undefined, {}]) {
    assert.throws(() => verifyIntent(bad, admin._id), /not valid/, String(bad).slice(0, 30));
  }
  const old = createIntent({ key: 'portfolio/2026/11/' + 'c'.repeat(32) + '.jpg', type: 'image/jpeg', size: 10, adminId: admin._id }, Date.now() - 2 * 60 * 60 * 1000);
  assert.throws(() => verifyIntent(old, admin._id), /expired/);
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'a-completely-different-secret-value-0123456789';
  try { assert.throws(() => verifyIntent(token, admin._id), /not valid/); } finally { process.env.JWT_SECRET = previous; }
});

// ====================================================================== 4  r2 module basics
section('R2 module: keys, settings, limits');
await test('upload keys are random, made by the server, in the TEMPORARY folder; the permanent key is the same name without tmp/; the two kinds never overlap; client names and paths are never part of them', () => {
  const at = new Date(Date.UTC(2026, 10, 13));
  const keys = new Set(Array.from({ length: 200 }, () => r2.createTempKey('image/jpeg', at)));
  assert.equal(keys.size, 200);
  for (const k of keys) {
    assert.match(k, /^tmp\/portfolio\/2026\/11\/[a-f0-9]{32}\.jpg$/);
    const final = r2.finalKeyFor(k);
    assert.match(final, /^portfolio\/2026\/11\/[a-f0-9]{32}\.jpg$/);
    assert.equal(`tmp/${final}`, k);
    assert.deepEqual([r2.isTempKey(k), r2.isOwnKey(k), r2.isTempKey(final), r2.isOwnKey(final)], [true, false, false, true]);
    assert.ok(!final.startsWith(r2.TEMP_PREFIX) && k.startsWith(r2.TEMP_PREFIX) && final.startsWith(r2.PERMANENT_PREFIX));
  }
  assert.match(r2.createTempKey('image/png'), /^tmp\/.*\.png$/);
  assert.match(r2.createTempKey('image/webp'), /^tmp\/.*\.webp$/);
  assert.throws(() => r2.createTempKey('image/gif'));
  assert.throws(() => r2.finalKeyFor('portfolio/2026/11/' + 'a'.repeat(32) + '.jpg'), /temporary/);
  const hex = 'a'.repeat(32);
  for (const bad of ['../etc/passwd', 'portfolio/../x.jpg', 'portfolio/2026/11/../' + hex + '.jpg', 'other/2026/11/' + hex + '.jpg', 'portfolio/2026/11/abc.jpg', 'portfolio/2026/11/' + hex + '.exe', 'tmp/portfolio/2026/11/' + hex + '.jpg', '', null, 42]) {
    assert.equal(r2.isOwnKey(bad), false, String(bad));
  }
  for (const bad of ['tmp/../portfolio/2026/11/' + hex + '.jpg', 'tmp/other/2026/11/' + hex + '.jpg', 'tmp/portfolio/2026/11/' + hex + '.exe', 'tmp/portfolio/2026/11/abc.jpg', 'tmp//portfolio/2026/11/' + hex + '.jpg', 'portfolio/2026/11/' + hex + '.jpg', 'tmp/tmp/portfolio/2026/11/' + hex + '.jpg', '', null, 42]) {
    assert.equal(r2.isTempKey(bad), false, String(bad));
  }
});
await test('public address: trailing slash tolerated; a record is genuine only with our key AND exactly our address', () => {
  const key = 'portfolio/2026/11/' + 'a'.repeat(32) + '.jpg';
  assert.equal(r2.publicUrl(key), `${PUBLIC_BASE}/${key}`);
  assert.equal(r2.isOwnImage({ provider: 'r2', key, url: `${PUBLIC_BASE}/${key}` }), true);
  assert.equal(r2.isOwnImage({ provider: 'r2', key, url: `https://evil.example/${key}` }), false);
  assert.equal(r2.isOwnImage({ provider: 'cloudinary', key, url: `${PUBLIC_BASE}/${key}` }), false);
  assert.equal(r2.isOwnImage({ provider: 'r2', key: '../x', url: `${PUBLIC_BASE}/../x` }), false);
});
await test('missing settings are reported by NAME only, never with a value; the provider defaults to Cloudinary; the size limit has a safe default', () => {
  const keep = { ...process.env };
  try {
    delete process.env.R2_BUCKET; process.env.R2_SECRET_ACCESS_KEY = ''; delete process.env.R2_PUBLIC_BASE_URL;
    assert.deepEqual(r2.missingSettings(), ['R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL']);
    process.env.R2_PUBLIC_BASE_URL = 'javascript:alert(1)';
    assert.ok(r2.missingSettings().includes('R2_PUBLIC_BASE_URL'));
    delete process.env.IMAGE_STORAGE_PROVIDER; assert.equal(r2.activeProvider(), 'cloudinary');
    process.env.IMAGE_STORAGE_PROVIDER = 'something-else'; assert.equal(r2.activeProvider(), 'cloudinary');
    process.env.IMAGE_STORAGE_PROVIDER = ' R2 '; assert.equal(r2.activeProvider(), 'r2');
    for (const [value, expected] of [[undefined, mb(40)], ['25', mb(25)], ['0', mb(40)], ['-3', mb(40)], ['abc', mb(40)], ['999999', mb(40)], ['0.5', mb(0.5)]]) {
      if (value === undefined) delete process.env.R2_MAX_UPLOAD_MB; else process.env.R2_MAX_UPLOAD_MB = value;
      assert.equal(r2.maxUploadBytes(), expected, String(value));
    }
  } finally { for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k]; Object.assign(process.env, keep); }
});

// ====================================================================== 5  who may use it, and the switch
section('who may use it, and the provider switch');
await test('every new route refuses a missing token (401) and a non-admin (403)', async () => {
  await reset();
  for (const [method, path, body] of [['GET', '/upload-config'], ['POST', '/uploads', { contentType: 'image/jpeg', size: 10 }], ['POST', '/uploads/finalize', { token: 'x' }]]) {
    assert.equal((await api(method, path, { as: null, body })).status, 401, `${method} ${path} without login`);
    assert.equal((await api(method, path, { as: customer, body })).status, 403, `${method} ${path} as a customer`);
  }
});
await test('upload-config tells the screen where photos go and the limits; it never contains a credential', async () => {
  await reset();
  const r = await api('GET', '/upload-config');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.data, { provider: 'r2', ready: true, maxBytes: mb(40), allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] });
  process.env.IMAGE_STORAGE_PROVIDER = 'cloudinary';
  const c = await api('GET', '/upload-config');
  assert.deepEqual([c.data.data.provider, c.data.data.ready, c.data.data.maxBytes], ['cloudinary', true, null]);
  assert.ok(!c.text.includes(SECRET_KEY) && !c.text.includes(ACCESS_KEY_ID));
});
await test('with the provider switched back to Cloudinary the R2 routes refuse (409) and prepare nothing; the Cloudinary signature route still works', async () => {
  await reset();
  process.env.IMAGE_STORAGE_PROVIDER = 'cloudinary';
  const a = await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: 100 } });
  assert.equal(a.status, 409);
  assert.equal((await api('POST', '/uploads/finalize', { body: { token: 'x' } })).status, 409);
  assert.equal(fake.calls.length, 0);
  const sig = await api('GET', '/upload-signature');
  assert.equal(sig.status, 200);
  assert.equal(sig.data.data.cloudName, 'democloud');
  assert.ok(!sig.text.includes('CLOUD-SECRET-VALUE-XYZ'));
});
await test('R2 chosen but not set up: 503 naming the missing settings (names only, no values)', async () => {
  await reset();
  delete process.env.R2_BUCKET;
  const r = await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: 100 } });
  assert.equal(r.status, 503);
  assert.match(r.data.message, /R2_BUCKET/);
  assert.ok(!r.text.includes(SECRET_KEY) && !r.text.includes(ACCESS_KEY_ID));
});

// ====================================================================== 6  preparing an upload
section('preparing an upload: validation and what the browser receives');
await test('type and size are validated before anything is prepared', async () => {
  await reset();
  const bad = [
    [{ contentType: 'image/gif', size: 100 }, 'contentType'], [{ contentType: 'application/pdf', size: 100 }, 'contentType'], [{ size: 100 }, 'contentType'],
    [{ contentType: 'image/jpeg', size: 0 }, 'size'], [{ contentType: 'image/jpeg', size: -5 }, 'size'], [{ contentType: 'image/jpeg', size: 1.5 }, 'size'],
    [{ contentType: 'image/jpeg', size: '100' }, 'size'], [{ contentType: 'image/jpeg' }, 'size'],
  ];
  for (const [body, field] of bad) {
    const r = await api('POST', '/uploads', { body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.data.errors?.[field], `${JSON.stringify(body)} → expected an error on ${field}: ${r.text}`);
  }
  assert.equal(fake.calls.length, 0);
});
await test('a photo over the limit is refused with a clear message (default 40 MB, and R2_MAX_UPLOAD_MB changes it); exactly the limit is accepted', async () => {
  await reset();
  const over = await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: mb(40) + 1 } });
  assert.equal(over.status, 400);
  assert.match(over.data.message, /largest photo allowed is 40 MB/);
  assert.equal((await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: mb(40) } })).status, 201);
  process.env.R2_MAX_UPLOAD_MB = '5';
  const small = await api('POST', '/uploads', { body: { contentType: 'image/png', size: mb(6) } });
  assert.equal(small.status, 400);
  assert.match(small.data.message, /6\.0 MB.*5\.0 MB/);
});
await test('the answer holds what the browser needs and nothing more: an address for ONE object, the headers to send, a token. No secret, no key, and a file NAME from the client is ignored', async () => {
  await reset();
  const r = await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: 1000, filename: '../../../etc/passwd.jpg', key: 'portfolio/hacked.jpg' } });
  assert.equal(r.status, 201);
  const d = r.data.data;
  assert.deepEqual(Object.keys(d).sort(), ['expiresIn', 'headers', 'maxBytes', 'method', 'token', 'uploadUrl']);
  assert.equal(d.method, 'PUT');
  assert.deepEqual(d.headers, { 'Content-Type': 'image/jpeg' });
  assert.equal(d.expiresIn, 600);
  const u = new URL(d.uploadUrl);
  assert.equal(u.origin, process.env.R2_ENDPOINT);
  assert.match(u.pathname, new RegExp(`^/${BUCKET}/tmp/portfolio/\\d{4}/\\d{2}/[a-f0-9]{32}\\.jpg$`));
  assert.equal(u.searchParams.get('X-Amz-Expires'), '600');
  assert.match(u.searchParams.get('X-Amz-SignedHeaders'), /content-type/);
  assert.ok(!r.text.includes(SECRET_KEY));
  assert.ok(!r.text.includes('hacked') && !r.text.includes('passwd'));
  assert.equal(fake.calls.length, 0, 'preparing an upload does not even talk to R2');
});

// ====================================================================== 7  the real upload path
section('upload straight to (fake) R2, then finalize');
await test('a small photo: browser PUT → finalize → one record with the right address, size, type and dimensions; the key and secrets never reach the API output', async () => {
  await reset();
  const bytes = makeJpeg({ width: 6000, height: 4000, totalBytes: mb(3) });
  const { prepared, put } = await prepareAndUpload(bytes);
  assert.equal(put.status, 200);
  assert.equal(fake.objects.size, 1);
  const f = await finalize(prepared.token, { description: 'Golden hour', sortOrder: 3 });
  assert.equal(f.status, 201, f.text);
  const p = f.data.data;
  const key = [...fake.objects.keys()][0];
  assert.equal(p.src, `${PUBLIC_BASE}/${key}`);
  assert.deepEqual([p.image.provider, p.image.bytes, p.image.contentType, p.image.width, p.image.height], ['r2', bytes.length, 'image/jpeg', 6000, 4000]);
  assert.equal(p.ratio, 1.5);
  assert.deepEqual([p.title, p.category, p.description, p.alt, p.isPublished], ['First dance', 'wedding', 'Golden hour', 'First dance', true]);
  assert.ok(!('key' in p.image) && !('publicId' in p.image));
  assert.ok(!f.text.includes(key.split('/').pop().split('.')[0]) || f.text.includes(`${PUBLIC_BASE}/${key}`)); // the key appears only inside the public address
  assert.equal(rows.length, 1);
  assert.equal(rows[0].image.key, key);
  assert.deepEqual(fake.calls.map((c) => c.split(' ')[0]), ['PUT', 'HEAD', 'GET', 'COPY', 'HEAD', 'DELETE']);
  assert.deepEqual([keysUnder('tmp/').length, keysUnder('portfolio/').length], [0, 1]);
});
await test('a 12 MB and a 38 MB photo (above Cloudinary\'s 10 MB, inside our 40 MB) upload and are recorded; the file never passes through the API (its biggest request stayed tiny)', async () => {
  await reset();
  biggestApiBody = 0;
  for (const size of [mb(12), mb(38)]) {
    const bytes = makeJpeg({ width: 8192, height: 5464, totalBytes: size });
    const { prepared, put } = await prepareAndUpload(bytes);
    assert.equal(put.status, 200);
    const f = await finalize(prepared.token);
    assert.equal(f.status, 201, f.text);
    assert.equal(f.data.data.image.bytes, size);
  }
  assert.equal(rows.length, 2);
  assert.ok(biggestApiBody < 2000, `the API received a body of ${biggestApiBody} bytes`);
  assert.ok([...fake.objects.values()].some((o) => o.body.length === mb(38)));
});
await test('PNG and WebP photos work too, with their own types and sizes', async () => {
  await reset();
  for (const [bytes, type, w, h] of [[makePng(4000, 3000, 5000), 'image/png', 4000, 3000], [makeWebpLossy(2400, 1600), 'image/webp', 2400, 1600]]) {
    const { prepared } = await prepareAndUpload(bytes, type);
    const f = await finalize(prepared.token);
    assert.equal(f.status, 201, f.text);
    assert.deepEqual([f.data.data.image.contentType, f.data.data.image.width, f.data.data.image.height], [type, w, h]);
  }
});
await test('a sideways camera photo (EXIF orientation 6, 6000x4000 stored) is recorded as the portrait a visitor sees (4000x6000, ratio 0.667)', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 6000, height: 4000, orientation: 6, totalBytes: 50000 }));
  const f = await finalize(prepared.token);
  assert.deepEqual([f.data.data.image.width, f.data.data.image.height, f.data.data.ratio], [4000, 6000, 0.667]);
});

// ====================================================================== 8  what R2 refuses
section('R2 itself refuses tampered uploads (signature, content type, address, time)');
await test('wrong Content-Type, a different object path, or a changed expiry → 403 and nothing is stored', async () => {
  await reset();
  const prepared = (await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: 100 } })).data.data;
  const bytes = makeJpeg({ width: 10, height: 10, totalBytes: 100 });
  assert.equal((await browserPut(prepared, bytes, { 'Content-Type': 'text/html' })).status, 403);
  assert.equal((await browserPut(prepared, bytes, { 'Content-Type': 'image/png' })).status, 403);
  const moved = { ...prepared, uploadUrl: prepared.uploadUrl.replace(/\/([a-f0-9]{32})\.jpg/, '/$1x.jpg') };
  assert.equal((await browserPut(moved, bytes)).status, 403);
  const longer = { ...prepared, uploadUrl: prepared.uploadUrl.replace('X-Amz-Expires=600', 'X-Amz-Expires=604800') };
  assert.equal((await browserPut(longer, bytes)).status, 403);
  const asDelete = await realFetch(prepared.uploadUrl, { method: 'DELETE' });
  assert.equal(asDelete.status, 403);
  assert.equal(fake.objects.size, 0);
  assert.equal((await browserPut(prepared, bytes)).status, 200); // the untouched address still works
});
await test('the upload address stops working after its time is up', async () => {
  await reset();
  const prepared = (await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: 100 } })).data.data;
  fake.clockOffsetMs = 601 * 1000; // 10 minutes and 1 second later
  assert.equal((await browserPut(prepared, makeJpeg({ width: 10, height: 10, totalBytes: 100 }))).status, 403);
  assert.equal(fake.objects.size, 0);
});

// ====================================================================== 9  finalize refusals
section('finalize only keeps what really arrived, and what was announced');
await test('finalize without any upload → 400 and no record', async () => {
  await reset();
  const prepared = (await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: 100 } })).data.data;
  const f = await finalize(prepared.token);
  assert.equal(f.status, 400);
  assert.match(f.data.message, /did not arrive/);
  assert.equal(rows.length, 0);
});
await test('a file of a different size than announced is refused, REMOVED from storage, and nothing is recorded', async () => {
  await reset();
  const { prepared, put } = await prepareAndUpload(makeJpeg({ width: 100, height: 100, totalBytes: 5000 }), 'image/jpeg', { announcedSize: 1000 });
  assert.equal(put.status, 200);
  const f = await finalize(prepared.token);
  assert.equal(f.status, 400);
  assert.match(f.data.message, /not what was announced/);
  assert.equal(rows.length, 0);
  assert.equal(fake.objects.size, 0);
  assert.ok(fake.calls.some((c) => c.startsWith('DELETE')));
});
await test('a file that is not a photo (text, or a PNG sent as JPEG) is refused, removed, and nothing is recorded', async () => {
  await reset();
  for (const bytes of [Buffer.from('<?php echo 1; ?>'.padEnd(2000, ' ')), makePng(100, 100, 2000)]) {
    const { prepared } = await prepareAndUpload(bytes, 'image/jpeg');
    const f = await finalize(prepared.token);
    assert.equal(f.status, 400);
    assert.match(f.data.message, /not a valid JPG, PNG or WebP/);
  }
  assert.equal(rows.length, 0);
  assert.equal(fake.objects.size, 0);
});
await test('a limit lowered after the upload was prepared still applies at finalize', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 100, height: 100, totalBytes: mb(2) }));
  process.env.R2_MAX_UPLOAD_MB = '1';
  const f = await finalize(prepared.token);
  assert.equal(f.status, 400);
  assert.equal(rows.length, 0);
  assert.equal(fake.objects.size, 0);
});
await test('missing title or category → 400 with field errors; the photo stays in R2 and the SAME token can be finalized again', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const bad = await api('POST', '/uploads/finalize', { body: { token: prepared.token, category: 'wedding' } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.errors?.title, bad.text);
  assert.equal(rows.length, 0);
  assert.equal(fake.objects.size, 1);
  const ok = await finalize(prepared.token, { title: 'Now with a title' });
  assert.equal(ok.status, 201);
  assert.equal(rows.length, 1);
});
await test('a token of another admin, a changed token, an expired token and no token are refused and touch nothing', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const before = fake.calls.length;
  assert.equal((await finalize(prepared.token, {}, other)).status, 400);
  assert.equal((await finalize(prepared.token.slice(0, -3) + 'AAA')).status, 400);
  assert.equal((await finalize(undefined)).status, 400);
  const key = [...fake.objects.keys()][0];
  const expired = createIntent({ key, type: 'image/jpeg', size: 4000, adminId: admin._id }, Date.now() - 3 * 60 * 60 * 1000);
  const e = await finalize(expired);
  assert.equal(e.status, 400);
  assert.match(e.data.message, /expired/);
  assert.equal(fake.calls.length, before, 'R2 was not contacted for a refused token');
  assert.equal(rows.length, 0);
});
await test('a token that names a key we would never make (other folder, path tricks, or a PERMANENT key) is refused even if its signature is genuine', async () => {
  await reset();
  for (const key of ['../../secret.jpg', 'other/2026/11/' + 'a'.repeat(32) + '.jpg', 'portfolio/2026/11/photo.jpg', 'portfolio/2026/11/' + 'a'.repeat(32) + '.jpg', 'tmp/../secret.jpg', 'tmp/other/2026/11/' + 'a'.repeat(32) + '.jpg', 'tmp/portfolio/2026/11/photo.jpg']) {
    const token = createIntent({ key, type: 'image/jpeg', size: 10, adminId: admin._id });
    assert.equal((await finalize(token)).status, 400, key);
  }
  assert.equal(fake.calls.length, 0);
});

// ====================================================================== 10  no duplicates
section('one upload = one record');
await test('finalizing the same upload again (double click, retry after a lost answer) returns the first record and creates nothing', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const a = await finalize(prepared.token);
  const b = await finalize(prepared.token, { title: 'A different title' });
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(b.data.duplicate, true);
  assert.equal(b.data.data.id, a.data.data.id);
  assert.equal(b.data.data.title, 'First dance', 'the first record is returned unchanged');
  assert.equal(rows.length, 1);
});
await test('a retry of an already finalized upload is answered from the first record even if R2 is unreachable at that moment (R2 is not contacted)', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const a = await finalize(prepared.token);
  assert.equal(a.status, 201);
  fake.mode = 'down';
  const calls = fake.calls.length;
  const b = await finalize(prepared.token);
  assert.equal(b.status, 200, b.text);
  assert.equal(b.data.duplicate, true);
  assert.equal(b.data.data.id, a.data.data.id);
  assert.equal(fake.calls.length, calls, 'R2 was contacted for a retry that needed nothing');
});
await test('five finalizes of the same upload at the same moment → exactly one record (one 201, four 200 duplicates)', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const results = await Promise.all(Array.from({ length: 5 }, () => finalize(prepared.token)));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 200, 200, 201]);
  assert.equal(new Set(results.map((r) => r.data.data.id)).size, 1);
  assert.equal(rows.length, 1);
  assert.deepEqual([keysUnder('portfolio/').length, keysUnder('tmp/').length], [1, 0], 'one permanent object, no leftover');
});
await test('the Portfolio schema itself declares a unique index on image.key that only covers records that have a key', () => {
  const index = Portfolio.schema.indexes().find(([fields]) => Object.keys(fields).join() === 'image.key');
  assert.ok(index, 'no index on image.key');
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, { 'image.key': { $type: 'string' } });
});
await test('the stand-in\'s unique key really blocks a second record for one file (so the race test above means something)', async () => {
  await reset();
  const make = () => new Portfolio({ image: { url: `${PUBLIC_BASE}/portfolio/2026/11/${'d'.repeat(32)}.jpg`, provider: 'r2', key: `portfolio/2026/11/${'d'.repeat(32)}.jpg` }, title: 'x', category: 'wedding' });
  await make().save();
  await assert.rejects(() => make().save(), (e) => e.code === 11000);
  const noKey = () => new Portfolio({ image: { url: '/images/portfolio/gallery/wedding-01.jpg' }, title: 'x', category: 'wedding' });
  await noKey().save(); await noKey().save(); // records without a key never collide
  assert.equal(rows.length, 3);
});

// ====================================================================== 10b  the temporary folder
section('temporary folder: uploads land in tmp/, only checked photos reach portfolio/, leftovers are disposable');
const finalKeyOf = (prepared) => r2.finalKeyFor(new URL(prepared.uploadUrl).pathname.replace(`/${BUCKET}/`, ''));
const tempKeyOf = (prepared) => new URL(prepared.uploadUrl).pathname.replace(`/${BUCKET}/`, '');

await test('an upload lands in tmp/ only: before finalize NOTHING is in permanent storage, and the address cannot write to portfolio/', async () => {
  await reset();
  const { prepared, put } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  assert.equal(put.status, 200);
  assert.deepEqual(keysUnder('tmp/'), [tempKeyOf(prepared)]);
  assert.deepEqual(keysUnder('portfolio/'), []);
  const aimedAtPermanent = { ...prepared, uploadUrl: prepared.uploadUrl.replace('/tmp/portfolio/', '/portfolio/') };
  assert.equal((await browserPut(aimedAtPermanent, makeJpeg({ width: 1, height: 1 }))).status, 403, 'the signature covers the temporary key only');
  assert.deepEqual(keysUnder('portfolio/'), []);
});
await test('finalize validates the temporary object, copies it to portfolio/ (same random name, no tmp/), records THAT key, then deletes the temporary object; one record, one object', async () => {
  await reset();
  const bytes = makeJpeg({ width: 5000, height: 3000, totalBytes: 60000 });
  const { prepared } = await prepareAndUpload(bytes);
  const f = await finalize(prepared.token);
  assert.equal(f.status, 201, f.text);
  assert.deepEqual(fake.calls.map((c) => c.split(' ')[0]), ['PUT', 'HEAD', 'GET', 'COPY', 'HEAD', 'DELETE']);
  assert.deepEqual(keysUnder('tmp/'), []);
  assert.deepEqual(keysUnder('portfolio/'), [finalKeyOf(prepared)]);
  assert.equal(rows[0].image.key, finalKeyOf(prepared));
  assert.ok(f.data.data.src.endsWith(finalKeyOf(prepared)) && !f.data.data.src.includes('/tmp/'));
  assert.ok(fake.objects.get(finalKeyOf(prepared)).body.equals(bytes), 'the permanent object is byte for byte the upload');
  assert.equal(fake.objects.get(finalKeyOf(prepared)).type, 'image/jpeg');
  assert.ok(!seenBodies.at(-1).includes('tmp/'), 'the temporary key is not in the answer');
});

section('abandoned and refused uploads can be cleaned up without touching finalized photos');
await test('SCENARIO: 2 finalized photos, 1 abandoned upload, 1 prepared-never-uploaded, 1 oversized and 1 invalid upload whose clean-up failed → the lifecycle rule for tmp/ removes exactly the leftovers and every photo still works', async () => {
  await reset();
  const photos = [];
  for (const title of ['Alpha', 'Beta']) {
    const { prepared } = await prepareAndUpload(makeJpeg({ width: 4000, height: 3000, totalBytes: 30000 }));
    photos.push({ id: (await finalize(prepared.token, { title })).data.data.id, key: finalKeyOf(prepared) });
  }
  const abandoned = (await prepareAndUpload(makeJpeg({ width: 400, height: 300, totalBytes: 5000 }))).prepared; // uploaded, never finalized
  const neverSent = (await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: 100 } })).data.data; // prepared, nothing uploaded
  fake.mode = 'deleteFail'; // R2 refuses the clean-up deletes of the next two refusals
  const oversized = (await prepareAndUpload(makeJpeg({ width: 400, height: 300, totalBytes: 9000 }), 'image/jpeg', { announcedSize: 2000 })).prepared;
  assert.equal((await finalize(oversized.token)).status, 400);
  const invalid = (await prepareAndUpload(Buffer.from('<?php echo 1; ?>'.padEnd(3000, ' ')))).prepared;
  assert.equal((await finalize(invalid.token)).status, 400);
  fake.mode = 'ok';

  assert.equal(keysUnder('tmp/').length, 3, 'abandoned + oversized + invalid are still waiting in tmp/');
  assert.equal(keysUnder('portfolio/').length, 2);
  assert.equal(rows.length, 2);

  assert.equal(sweep('tmp/'), 3); // the lifecycle rule runs
  assert.deepEqual(keysUnder('tmp/'), []);
  assert.deepEqual(keysUnder('portfolio/').sort(), photos.map((p) => p.key).sort());
  for (const p of photos) { // both photos are intact and served
    assert.ok(await r2.head(p.key), `${p.key} is gone`);
    assert.equal(rows.find((r) => r._id === p.id).image.key, p.key);
  }
  assert.equal((await api('GET', '/', { as: null })).data.count, 2);
  assert.equal((await finalize(abandoned.token)).status, 400, 'an abandoned upload cannot be finalized once it was cleaned up');
  assert.equal((await finalize(neverSent.token)).status, 400);
  assert.equal(rows.length, 2);
  assert.deepEqual(keysUnder('portfolio/').sort(), photos.map((p) => p.key).sort());
  assert.equal((await api('DELETE', `/${photos[0].id}`)).data.storageDeleted, true); // and deleting one photo removes just that object
  assert.deepEqual(keysUnder('portfolio/'), [photos[1].key]);
});
await test('no finalized photo can ever live under tmp/, and nothing under tmp/ can ever be a photo record: the two folders never overlap', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  await finalize(prepared.token);
  for (const row of rows) assert.ok(r2.isOwnKey(row.image.key) && !row.image.key.startsWith('tmp/') && !row.image.url.includes('/tmp/'));
  // a forged record pointing at a temporary object is not "ours"
  const tempKey = tempKeyOf(prepared);
  assert.equal(r2.isOwnImage({ provider: 'r2', key: tempKey, url: `${PUBLIC_BASE}/${tempKey}` }), false);
});

section('oversized uploads (the address cannot limit the bytes, so finalize does)');
await test('more bytes than announced (8 KB sent for 2 KB announced): refused, the file is NOT read, deleted from tmp/, nothing in portfolio/, no record', async () => {
  await reset();
  const { prepared, put } = await prepareAndUpload(makeJpeg({ width: 400, height: 300, totalBytes: 8000 }), 'image/jpeg', { announcedSize: 2000 });
  assert.equal(put.status, 200, 'R2 itself does not stop it: the signed address has no size limit');
  const f = await finalize(prepared.token);
  assert.equal(f.status, 400);
  assert.match(f.data.message, /not what was announced/);
  assert.deepEqual(fake.calls.map((c) => c.split(' ')[0]), ['PUT', 'HEAD', 'DELETE'], 'measured with HEAD, never downloaded');
  assert.deepEqual([keysUnder('tmp/'), keysUnder('portfolio/'), rows.length], [[], [], 0]);
});
await test('an upload far above the server limit (3 MB announced as 400 KB, limit 1 MB): refused after HEAD without reading a byte, and removed', async () => {
  await reset();
  process.env.R2_MAX_UPLOAD_MB = '1';
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 4000, height: 3000, totalBytes: mb(3) }), 'image/jpeg', { announcedSize: 400000 });
  const f = await finalize(prepared.token);
  assert.equal(f.status, 400);
  assert.ok(!fake.calls.some((c) => c.startsWith('GET') || c.startsWith('COPY')));
  assert.deepEqual([keysUnder('tmp/'), keysUnder('portfolio/')], [[], []]);
});
await test('a refused oversized file that could not be deleted right now stays in tmp/ only; the lifecycle rule removes it and permanent storage never saw it', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 400, height: 300, totalBytes: 8000 }), 'image/jpeg', { announcedSize: 2000 });
  fake.mode = 'deleteFail';
  assert.equal((await finalize(prepared.token)).status, 400);
  fake.mode = 'ok';
  assert.deepEqual([keysUnder('tmp/').length, keysUnder('portfolio/').length], [1, 0]);
  assert.equal(sweep('tmp/'), 1);
  assert.deepEqual([...fake.objects.keys()], []);
});

section('refused pictures: truncated and malformed files never become records');
await test('a TRUNCATED photo of exactly the announced size (the upload was cut and padded, or the file was cut before it was picked) is refused, deleted, and never copied', async () => {
  await reset();
  const whole = makeJpeg({ width: 6000, height: 4000, totalBytes: 200000 });
  const cut = whole.subarray(0, 150000);
  const { prepared } = await prepareAndUpload(cut); // announced size = the cut size: every size check passes, only the content is wrong
  const f = await finalize(prepared.token);
  assert.equal(f.status, 400);
  assert.match(f.data.message, /incomplete/);
  assert.ok(!fake.calls.some((c) => c.startsWith('COPY')));
  assert.deepEqual([keysUnder('tmp/'), keysUnder('portfolio/'), rows.length], [[], [], 0]);
});
await test('a PNG with a damaged header and a WebP with a damaged header are refused through the API as well, each removed from tmp/', async () => {
  await reset();
  const png = makePng(500, 400, 3000); png[28] ^= 0xff; // the last IHDR byte (interlace): header and checksum no longer agree
  const webp = makeWebpLossy(500, 400, 2000); webp.writeUInt16LE(0, 26); // width 0
  for (const [bytes, type, pattern] of [[png, 'image/png', /damaged/], [webp, 'image/webp', /damaged/]]) {
    const { prepared } = await prepareAndUpload(bytes, type);
    const f = await finalize(prepared.token);
    assert.equal(f.status, 400, f.text);
    assert.match(f.data.message, pattern);
  }
  assert.deepEqual([keysUnder('tmp/'), keysUnder('portfolio/'), rows.length], [[], [], 0]);
});
await test('a photo whose metadata is bigger than the old 512 KB look-ahead (1.2 MB) is finalized with its real size, and a valid PNG and WebP pass too', async () => {
  await reset();
  const heavy = makeJpeg({ width: 6000, height: 4000, orientation: 6, metadataBytes: 1_200_000, totalBytes: mb(3) });
  const { prepared } = await prepareAndUpload(heavy);
  const f = await finalize(prepared.token);
  assert.equal(f.status, 201, f.text);
  assert.deepEqual([f.data.data.image.width, f.data.data.image.height, f.data.data.image.bytes], [4000, 6000, heavy.length]);
  for (const [bytes, type] of [[makePng(2000, 1000, 9000), 'image/png'], [makeWebpExtended(2000, 1000), 'image/webp']]) {
    assert.equal((await finalize((await prepareAndUpload(bytes, type)).prepared.token)).status, 201);
  }
});

section('copy and finalization failures: nothing half-done is left behind, and the same token can try again');
await test('the copy fails (R2 answers 500) → 502; no record, nothing in portfolio/, the temporary file stays; the SAME token then succeeds', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  fake.mode = 'copyFail';
  const f = await finalize(prepared.token);
  assert.equal(f.status, 502);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [0, 0, 1]);
  fake.mode = 'ok';
  const again = await finalize(prepared.token);
  assert.equal(again.status, 201, again.text);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [1, 1, 0]);
});
await test('the copy is answered "200" but the body is an error → treated as failed: 502, no record, no permanent object', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  fake.mode = 'copyErrorBody';
  assert.equal((await finalize(prepared.token)).status, 502);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [0, 0, 1]);
});
await test('the copy silently stores HALF the file (R2 says ok): the verification after the copy catches it → 502, the half object is REMOVED, no record; the same token works afterwards', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 20000 }));
  fake.mode = 'copyHalf';
  const f = await finalize(prepared.token);
  assert.equal(f.status, 502);
  assert.match(f.data.message, /could not be copied/);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [0, 0, 1]);
  fake.mode = 'ok';
  assert.equal((await finalize(prepared.token)).status, 201);
  assert.equal(fake.objects.get(finalKeyOf(prepared)).body.length, 20000);
});
await test('the temporary file is REPLACED after it was checked but before it was copied (the upload address can be reused for 10 minutes) → the copy is refused (If-Match), nothing becomes permanent, the replaced file is removed', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const key = tempKeyOf(prepared);
  fake.beforeCopy = async () => { fake.objects.set(key, { body: Buffer.from('<?php evil ?>'.padEnd(4000, ' ')), type: 'image/jpeg' }); };
  const f = await finalize(prepared.token);
  assert.equal(f.status, 400);
  assert.match(f.data.message, /changed while it was being checked/);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [0, 0, 0]);
});
await test('the temporary file is REPLACED while it is being read (the read is pinned to the checked version with If-Match) → refused as changed, the replaced file is removed, nothing permanent', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const key = tempKeyOf(prepared);
  fake.beforeGet = async () => { fake.objects.set(key, { body: Buffer.alloc(4000, 0x41), type: 'image/jpeg' }); }; // swapped after HEAD, before GET
  const f = await finalize(prepared.token);
  assert.equal(f.status, 400);
  assert.match(f.data.message, /changed while it was being checked/);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [0, 0, 0]);
  assert.ok(!fake.calls.some((c) => c.startsWith('COPY')));
});
await test('the temporary file disappears between the check and the copy (404) → 400 and nothing is recorded or left', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  fake.beforeCopy = async () => { fake.objects.delete(tempKeyOf(prepared)); };
  assert.equal((await finalize(prepared.token)).status, 400);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length], [0, 0]);
});

await test('SAVING THE RECORD FAILS after the copy (database error) → 500, the permanent copy is removed because no record uses it, the temporary file stays, the SAME token then succeeds', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const realSave = Portfolio.prototype.save;
  Portfolio.prototype.save = async function failingSave() { throw new Error('database unavailable'); };
  let f;
  try { f = await finalize(prepared.token); } finally { Portfolio.prototype.save = realSave; }
  assert.equal(f.status, 500);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [0, 0, 1]);
  const again = await finalize(prepared.token);
  assert.equal(again.status, 201, again.text);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [1, 1, 0]);
});
await test('saving fails AND the database cannot be asked afterwards: the permanent copy is KEPT (never delete what might be in use); the retry reuses the same key, no duplicate object, one record', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const realSave = Portfolio.prototype.save;
  const realFindOne = Portfolio.findOne;
  Portfolio.prototype.save = async function failingSave() { Portfolio.findOne = () => Promise.reject(new Error('database down')); throw new Error('database down'); };
  let f;
  try { f = await finalize(prepared.token); } finally { Portfolio.prototype.save = realSave; Portfolio.findOne = realFindOne; }
  assert.equal(f.status, 500);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [0, 1, 1], 'unsure → the file is kept');
  const again = await finalize(prepared.token);
  assert.equal(again.status, 201, again.text);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [1, 1, 0]);
  assert.equal(rows[0].image.key, keysUnder('portfolio/')[0]);
});
await test('saving fails with a database error while ANOTHER finalize of the same upload already recorded the photo: the permanent file is KEPT (a visible photo uses it)', async () => {
  await reset();
  const bytes = makeJpeg({ width: 300, height: 200, totalBytes: 4000 });
  const { prepared } = await prepareAndUpload(bytes);
  const key = finalKeyOf(prepared);
  const realSave = Portfolio.prototype.save;
  Portfolio.prototype.save = async function racingSave() { // the other request wins first, then this one's connection breaks
    Portfolio.prototype.save = realSave;
    await new Portfolio({ image: { url: r2.publicUrl(key), provider: 'r2', key, bytes: bytes.length, contentType: 'image/jpeg', width: 300, height: 200 }, title: 'Winner', category: 'wedding' }).save();
    throw new Error('connection lost');
  };
  let f;
  try { f = await finalize(prepared.token); } finally { Portfolio.prototype.save = realSave; }
  assert.equal(f.status, 500);
  assert.equal(rows.length, 1);
  assert.deepEqual(keysUnder('portfolio/'), [key], 'the file the recorded photo uses must still exist');
});
await test('a stuck half-finished upload (permanent copy exists, no record, temporary file still there: e.g. the server restarted in between) is completed by the same token: same key, one object, one record', async () => {
  await reset();
  const bytes = makeJpeg({ width: 300, height: 200, totalBytes: 4000 });
  const { prepared } = await prepareAndUpload(bytes);
  fake.objects.set(finalKeyOf(prepared), { body: bytes, type: 'image/jpeg' });
  const f = await finalize(prepared.token);
  assert.equal(f.status, 201, f.text);
  assert.deepEqual([rows.length, keysUnder('portfolio/').length, keysUnder('tmp/').length], [1, 1, 0]);
});
await test('a missing title is refused BEFORE storage is touched (no copy, no read); the file waits in tmp/ and the same token works with a title', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const before = fake.calls.length;
  const bad = await api('POST', '/uploads/finalize', { body: { token: prepared.token, category: 'wedding' } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.errors?.title);
  assert.equal(fake.calls.length, before, 'R2 was not contacted');
  assert.deepEqual([keysUnder('tmp/').length, keysUnder('portfolio/').length], [1, 0]);
  assert.equal((await finalize(prepared.token, { title: 'Titled' })).status, 201);
});

section('retries');
await test('the temporary file could not be deleted after a successful finalize: the answer is still 201, a retry answers from the record without contacting R2, and the leftover is swept away later', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  fake.mode = 'deleteFail';
  const a = await finalize(prepared.token);
  fake.mode = 'ok';
  assert.equal(a.status, 201, a.text);
  assert.deepEqual([keysUnder('tmp/').length, keysUnder('portfolio/').length], [1, 1]);
  const calls = fake.calls.length;
  const b = await finalize(prepared.token);
  assert.deepEqual([b.status, b.data.duplicate, b.data.data.id], [200, true, a.data.data.id]);
  assert.equal(fake.calls.length, calls);
  assert.equal(sweep('tmp/'), 1);
  assert.deepEqual(keysUnder('portfolio/'), [finalKeyOf(prepared)]);
  assert.equal(rows.length, 1);
});
await test('after a photo was finalized and DELETED, an old finalize retry does not bring it back (its temporary file is gone)', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const made = (await finalize(prepared.token)).data.data;
  assert.equal((await api('DELETE', `/${made.id}`)).status, 200);
  const again = await finalize(prepared.token);
  assert.equal(again.status, 400);
  assert.deepEqual([rows.length, fake.objects.size], [0, 0]);
});
await test('retries after every kind of failure never leave more than one permanent object or one record per upload (20 random failure/retry sequences)', async () => {
  const modes = ['ok', 'copyFail', 'copyErrorBody', 'copyHalf', 'down', 'drop'];
  for (let run = 0; run < 20; run += 1) {
    await reset();
    const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 6000 }));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      fake.mode = modes[Math.floor(Math.random() * modes.length)];
      await finalize(prepared.token);
      assert.ok(rows.length <= 1 && keysUnder('portfolio/').length <= 1, `run ${run}: ${rows.length} records, ${keysUnder('portfolio/').length} objects`);
    }
    fake.mode = 'ok';
    const last = await finalize(prepared.token);
    assert.ok([200, 201].includes(last.status), last.text);
    assert.deepEqual([rows.length, keysUnder('portfolio/').length], [1, 1]);
    assert.equal(rows[0].image.key, keysUnder('portfolio/')[0]);
  }
});

// ====================================================================== 11  R2 trouble
section('when R2 is down or unreachable');
await test('R2 answering 500 at finalize → 502, nothing recorded, and the same token works once R2 is back', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  fake.mode = 'down';
  const f = await finalize(prepared.token);
  assert.equal(f.status, 502);
  assert.match(f.data.message, /refused/);
  assert.equal(rows.length, 0);
  fake.mode = 'ok';
  assert.equal((await finalize(prepared.token)).status, 201);
  assert.equal(rows.length, 1);
});
await test('R2 not reachable at all → 502 "Could not reach", without the address or any key in the message', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  fake.mode = 'drop';
  const f = await finalize(prepared.token);
  assert.equal(f.status, 502);
  assert.match(f.data.message, /Could not reach Cloudflare R2/);
  assert.ok(!f.text.includes('127.0.0.1') && !f.text.includes(SECRET_KEY) && !f.text.includes('X-Amz'));
  assert.equal(rows.length, 0);
});

// ====================================================================== 12  everything else keeps working
section('existing portfolio features keep working (display, edit, delete, Cloudinary, pasted URLs)');
await test('public list and admin list show an R2 photo with src/width/height/ratio, without key or publicId; drafts stay hidden from the public', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 3000, height: 2000, totalBytes: 9000 }));
  const made = (await finalize(prepared.token)).data.data;
  const { prepared: p2 } = await prepareAndUpload(makeJpeg({ width: 3000, height: 2000, totalBytes: 9000 }));
  await finalize(p2.token, { title: 'Draft', isPublished: false });
  const pub = await api('GET', '/', { as: null });
  assert.equal(pub.status, 200);
  assert.equal(pub.data.count, 1);
  assert.equal(pub.data.data[0].src, made.src);
  assert.ok(!pub.text.includes('"key"') && !pub.text.includes('publicId'));
  assert.equal((await api('GET', '/admin')).data.count, 2);
});
await test('editing an R2 photo (title, featured, publish) works; the image itself cannot be swapped', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const made = (await finalize(prepared.token)).data.data;
  const e = await api('PATCH', `/${made.id}`, { body: { title: 'Renamed', featured: true, isPublished: false } });
  assert.equal(e.status, 200);
  assert.deepEqual([e.data.data.title, e.data.data.featured, e.data.data.isPublished], ['Renamed', true, false]);
  assert.equal(e.data.data.src, made.src);
  const swap = await api('PATCH', `/${made.id}`, { body: { image: { url: 'https://evil.example/x.jpg' } } });
  assert.equal(swap.status, 400);
  assert.equal(rows[0].image.url, made.src);
});
await test('deleting an R2 photo removes the record AND the file from R2 (storageDeleted: true)', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const made = (await finalize(prepared.token)).data.data;
  assert.equal(fake.objects.size, 1);
  const d = await api('DELETE', `/${made.id}`);
  assert.equal(d.status, 200);
  assert.equal(d.data.storageDeleted, true);
  assert.equal(rows.length, 0);
  assert.equal(fake.objects.size, 0);
  assert.equal(cloudinaryCalls.length, 0, 'an R2 photo is never sent to Cloudinary');
});
await test('deleting while R2 is down still removes the record and says the file could not be deleted (storageDeleted: false)', async () => {
  await reset();
  const { prepared } = await prepareAndUpload(makeJpeg({ width: 300, height: 200, totalBytes: 4000 }));
  const made = (await finalize(prepared.token)).data.data;
  fake.mode = 'down';
  const d = await api('DELETE', `/${made.id}`);
  assert.equal(d.status, 200);
  assert.equal(d.data.storageDeleted, false);
  assert.match(d.data.message, /could not be deleted/);
  assert.equal(rows.length, 0);
});
await test('Cloudinary photos are created and deleted exactly as before; R2 fields sent by a client are ignored', async () => {
  await reset();
  const publicId = 'alex-morgan/portfolio/sample123';
  const url = `https://res.cloudinary.com/democloud/image/upload/v1/${publicId}.jpg`;
  const created = await api('POST', '/', {
    body: { title: 'Old style', category: 'portrait', image: { url, publicId, width: 1200, height: 800, provider: 'r2', key: `portfolio/2026/11/${'e'.repeat(32)}.jpg`, bytes: 5 } },
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(rows[0].image.publicId, publicId);
  assert.equal(rows[0].image.provider, undefined);
  assert.equal(rows[0].image.key, undefined);
  assert.equal(rows[0].image.bytes, undefined);
  const forged = await api('POST', '/', { body: { title: 'Forged', category: 'portrait', image: { url: 'https://evil.example/a.jpg', publicId: 'someone/else' } } });
  assert.equal(forged.status, 400);
  const del = await api('DELETE', `/${created.data.data.id}`);
  assert.equal(del.data.storageDeleted, true);
  assert.equal(cloudinaryCalls.length, 1);
  assert.match(cloudinaryCalls[0], /democloud\/image\/destroy/);
  assert.equal(fake.calls.length, 0, 'a Cloudinary photo never touches R2');
});
await test('pasted-URL and local-path photos are created and deleted as before (storageDeleted: null)', async () => {
  await reset();
  for (const image of [{ url: 'https://example.com/a.jpg' }, { url: '/images/portfolio/gallery/wedding-01.jpg' }]) {
    const c = await api('POST', '/', { body: { title: 'Plain', category: 'events', image } });
    assert.equal(c.status, 201, c.text);
    const d = await api('DELETE', `/${c.data.data.id}`);
    assert.equal(d.data.storageDeleted, null);
  }
  assert.equal(cloudinaryCalls.length + fake.calls.length, 0);
});
await test('old records that have no provider at all (created before this change) still display and delete through Cloudinary', async () => {
  await reset();
  const legacy = new Portfolio({ image: { url: 'https://res.cloudinary.com/democloud/image/upload/v1/alex-morgan/portfolio/old1.jpg', publicId: 'alex-morgan/portfolio/old1', width: 100, height: 100 }, title: 'Legacy', category: 'wedding' });
  await legacy.save();
  assert.equal((await api('GET', '/', { as: null })).data.count, 1);
  const d = await api('DELETE', `/${legacy._id}`);
  assert.equal(d.data.storageDeleted, true);
  assert.equal(cloudinaryCalls.length, 1);
});

// ====================================================================== 13  limiter and hygiene
section('rate limit and logging hygiene');
await test('the 61st upload preparation within ten minutes is answered 429 (and the limit is shared by finalize)', async () => {
  await reset();
  let last;
  for (let i = 0; i < 70; i += 1) {
    last = await api('POST', '/uploads', { body: { contentType: 'image/jpeg', size: 100 } });
    if (last.status === 429) { assert.ok(i >= 40, `limited too early (request ${i + 1})`); break; }
  }
  assert.equal(last.status, 429);
  assert.match(last.data.message, /Too many uploads/);
});
await test('nothing sensitive was logged or answered during all the tests above (secret key, signatures, tokens, upload addresses)', () => {
  const everything = [...logs, ...seenBodies.filter((t) => !t.includes('uploadUrl')), ...fake.calls];
  const text = everything.join('\n');
  assert.ok(!text.includes(SECRET_KEY), 'the R2 secret key appeared');
  assert.ok(!text.includes('CLOUD-SECRET-VALUE-XYZ'), 'the Cloudinary secret appeared');
  assert.ok(!/X-Amz-Signature/i.test(text), 'a signature appeared');
  assert.ok(!/X-Amz-Credential/i.test(text), 'a credential appeared outside the upload address');
  // the upload address itself is only ever in the answer to "prepare an upload"
  const withUrl = seenBodies.filter((t) => t.includes('uploadUrl'));
  assert.ok(withUrl.length > 0 && withUrl.every((t) => !t.includes(SECRET_KEY)));
  out(`      (${logs.length} log lines and ${seenBodies.length} API answers were scanned)`);
});

// ====================================================================== done
await new Promise((r) => apiServer.close(r));
await new Promise((r) => fakeServer.close(r));
globalThis.fetch = realFetch;
out(failed === 0 ? `\nAll ${passed} checks passed. (Mocked: fake R2, fake MongoDB, fake Cloudinary. Nothing here talked to real Cloudflare.)` : `\n${failed} of ${passed + failed} check(s) FAILED:\n  - ${failures.join('\n  - ')}`);
process.exit(failed === 0 ? 0 : 1);
