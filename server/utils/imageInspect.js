import zlib from 'node:zlib';

/**
 * Checks that an uploaded file is a COMPLETE, well-formed JPEG, PNG or WebP picture, and reads how big it looks to a visitor.
 * Used when an upload is finalized (see portfolioController.finalizeUpload), on the temporary copy, before it becomes a portfolio photo.
 *
 *   await inspectImage(source, 'image/jpeg', { maxBytes })
 *       → { ok: true, type, width, height }          width/height are ALWAYS real numbers when ok is true
 *       → { ok: false, reason }                      reason: see REASONS below
 *
 * `source` is a Buffer or an async iterable of Buffers (the object streamed from R2, any chunk size). The file is walked from
 * the first byte to the end of the picture in constant memory, so a 40 MB photo is never held in memory and the size of the
 * metadata in front of the picture does not matter (EXIF, ICC profiles, XMP, Photoshop blocks can be hundreds of KB):
 *
 *   JPEG  every segment up to the end-of-image marker (FF D9); a frame header and at least one scan must be present. Anything
 *         appended after FF D9 (phone "motion photo" videos, trailers) is ignored. EXIF orientation is applied to width/height.
 *   PNG   every chunk with its CRC, IHDR first, IDAT present, IEND last.
 *   WebP  the RIFF container up to its declared size, with a valid VP8 / VP8L / VP8X header and image data.
 *
 * This is a STRUCTURE check, not a pixel decoder: it proves the file is not cut off, not another kind of file, and has a
 * plausible header. A file whose compressed pixel data is internally corrupt but whose structure is intact would still pass.
 *
 * Never throws for a bad FILE (it answers ok: false). A failing SOURCE (the network read) is not the file's fault and is rethrown.
 */

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Why a file was refused (the controller turns these into messages). */
export const REASONS = ['not_an_image', 'type_mismatch', 'incomplete', 'malformed', 'unsupported', 'too_large', 'changed'];

/** Largest width/height accepted (JPEG's own maximum is 65535). */
export const MAX_SIDE = 65535;

class Invalid extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}
const incomplete = () => new Invalid('incomplete'); // the file ends before the picture does
const malformed = () => new Invalid('malformed'); // the bytes do not follow the format

// ---------------------------------------------------------------- CRC-32 (PNG chunks)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
/** Plain JavaScript CRC-32; `previous` is the value returned for the bytes before, so it can be fed piece by piece. */
export function crc32Js(buf, previous = 0) {
  let c = (previous ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const crc32 = typeof zlib.crc32 === 'function' ? (buf, previous = 0) => zlib.crc32(buf, previous) : crc32Js; // zlib's is native (Node 20.15+ / 22.2+)

// ---------------------------------------------------------------- reading a stream of unknown chunk sizes
const EMPTY = Buffer.alloc(0);

class Reader {
  constructor(iterable, limit) {
    this.iterator = typeof iterable[Symbol.asyncIterator] === 'function' ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
    this.buf = EMPTY;
    this.received = 0;
    this.limit = limit;
    this.finished = false;
  }

  /** Reads one more chunk from the source. false = the source has ended. */
  async pull() {
    if (this.finished) return false;
    const { done, value } = await this.iterator.next();
    if (done) { this.finished = true; return false; }
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    this.received += chunk.length;
    if (this.limit !== undefined && this.received > this.limit) throw new Invalid('changed'); // more bytes than the storage announced
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    return true;
  }

  async need(n) {
    while (this.buf.length < n) if (!(await this.pull())) throw incomplete();
  }

  /** The next n bytes (n is always a small, format-defined size, never a length read from the file). */
  async take(n) {
    await this.need(n);
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }

  async byte() {
    await this.need(1);
    const b = this.buf[0];
    this.buf = this.buf.subarray(1);
    return b;
  }

  /** Up to n bytes without consuming them (fewer if the file is shorter). */
  async peek(n) {
    while (this.buf.length < n && (await this.pull())) { /* keep reading */ }
    return this.buf.subarray(0, n);
  }

  /** Passes n bytes (any n) to `visit` piece by piece without keeping them. */
  async consume(n, visit) {
    let left = n;
    while (left > 0) {
      if (!this.buf.length && !(await this.pull())) throw incomplete();
      const k = Math.min(left, this.buf.length);
      if (visit) visit(this.buf.subarray(0, k));
      this.buf = this.buf.subarray(k);
      left -= k;
    }
  }

  skip(n) { return this.consume(n, null); }

  /** Inside JPEG scan data: moves to the next real marker and returns its second byte (FF 00 stuffing, restart markers and fill bytes are data). */
  async nextScanMarker() {
    for (;;) {
      if (!this.buf.length && !(await this.pull())) throw incomplete();
      const at = this.buf.indexOf(0xff);
      if (at === -1) { this.buf = EMPTY; continue; }
      this.buf = this.buf.subarray(at); // now starts with FF
      while (this.buf.length < 2) if (!(await this.pull())) throw incomplete();
      const next = this.buf[1];
      if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { this.buf = this.buf.subarray(2); continue; } // stuffed FF / restart marker
      if (next === 0xff) { this.buf = this.buf.subarray(1); continue; } // fill byte: the next FF may start the marker
      this.buf = this.buf.subarray(2);
      return next;
    }
  }

  async close() { // stop reading the source (releases the network connection when we finish early)
    try { await this.iterator.return?.(); } catch { /* nothing to release */ }
  }
}

const startsWith = (buf, bytes, at = 0) => buf.length >= at + bytes.length && bytes.every((b, i) => buf[at + i] === b);
const ascii = (buf, from, to) => (buf.length >= to ? buf.toString('latin1', from, to) : '');
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 'image/jpeg' | 'image/png' | 'image/webp' | null, judged by the file signature only. */
export function sniffType(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, PNG_SIGNATURE)) return 'image/png';
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const checkSize = (width, height) => {
  if (!(width >= 1 && height >= 1)) throw malformed();
  if (width > MAX_SIDE || height > MAX_SIDE) throw new Invalid('too_large');
};

// ---------------------------------------------------------------- PNG
const PNG_DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }; // colour type → allowed bit depths

async function checkPng(r) {
  await r.take(8); // signature (already recognised)
  let first = true;
  let size = null;
  let colourType = -1;
  let hasData = false;
  let hasPalette = false;
  for (;;) {
    const head = await r.take(8);
    const length = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    if (length > 0x7fffffff || !/^[A-Za-z]{4}$/.test(type)) throw malformed();
    if (first !== (type === 'IHDR')) throw malformed(); // IHDR must come first, and only once
    let crc = crc32(head.subarray(4, 8));
    if (type === 'IHDR') {
      if (length !== 13) throw malformed();
      const body = await r.take(13);
      crc = crc32(body, crc);
      const [depth, colour, compression, filter, interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (!PNG_DEPTHS[colour]?.includes(depth) || compression !== 0 || filter !== 0 || interlace > 1) throw malformed();
      size = { width: body.readUInt32BE(0), height: body.readUInt32BE(4) };
      colourType = colour;
      checkSize(size.width, size.height);
    } else {
      await r.consume(length, (piece) => { crc = crc32(piece, crc); });
    }
    if ((await r.take(4)).readUInt32BE(0) !== crc) throw malformed(); // the chunk's own checksum
    first = false;
    if (type === 'PLTE') hasPalette = true;
    if (type === 'IDAT') hasData = true;
    if (type === 'IEND') {
      if (length !== 0 || !hasData || (colourType === 3 && !hasPalette)) throw malformed();
      return size;
    }
  }
}

// ---------------------------------------------------------------- WebP
const le24 = (buf, at) => buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16);

async function checkWebp(r) {
  const head = await r.take(12);
  const riffSize = head.readUInt32LE(4); // bytes that follow the size field: "WEBP" + all chunks
  if (riffSize < 4 + 8) throw malformed();
  let left = riffSize - 4;
  let first = true;
  let canvas = null; // VP8X
  let frame = null; // VP8 / VP8L
  let animated = false;
  let hasData = false;
  while (left > 0) {
    if (left < 8) throw malformed();
    const chunkHead = await r.take(8);
    left -= 8;
    const fourcc = chunkHead.toString('latin1', 0, 4);
    const size = chunkHead.readUInt32LE(4);
    const padded = size + (size & 1); // chunks are padded to an even length
    if (size > left) throw malformed(); // a chunk that claims to run past the end of the container
    const skipAfter = (used) => r.skip(Math.min(padded, left) - used); // a missing pad byte at the very end is tolerated
    if (first && !['VP8 ', 'VP8L', 'VP8X'].includes(fourcc)) throw malformed();
    first = false;

    if (fourcc === 'VP8X') { // extended header: flags, 3 reserved bytes, canvas width-1 and height-1 (24 bit each)
      if (canvas || size < 10) throw malformed();
      const body = await r.take(10);
      animated = (body[0] & 0x02) !== 0;
      canvas = { width: 1 + le24(body, 4), height: 1 + le24(body, 7) };
      await skipAfter(10);
    } else if (fourcc === 'VP8 ') { // lossy: 3 byte frame tag (key frame), start code 9d 01 2a, 14-bit width and height
      if (size < 10) throw malformed();
      const body = await r.take(10);
      if ((body[0] & 0x01) !== 0 || !startsWith(body, [0x9d, 0x01, 0x2a], 3)) throw malformed();
      if (!frame) frame = { width: body.readUInt16LE(6) & 0x3fff, height: body.readUInt16LE(8) & 0x3fff };
      hasData = true;
      await skipAfter(10);
    } else if (fourcc === 'VP8L') { // lossless: signature byte 0x2f, then 14-bit (width-1) and (height-1)
      if (size < 5) throw malformed();
      const body = await r.take(5);
      if (body[0] !== 0x2f) throw malformed();
      const bits = body.readUInt32LE(1);
      if (!frame) frame = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      hasData = true;
      await skipAfter(5);
    } else {
      if (fourcc === 'ANMF') hasData = true; // an animation frame
      await skipAfter(0);
    }
    left -= Math.min(padded, left);
  }
  if (!hasData) throw malformed(); // a container without any picture in it
  if (canvas && frame && !animated && (canvas.width !== frame.width || canvas.height !== frame.height)) throw malformed();
  const size = canvas ?? frame;
  if (!size) throw malformed();
  checkSize(size.width, size.height);
  return size;
}

// ---------------------------------------------------------------- JPEG
const SOF_SUPPORTED = new Set([0xc0, 0xc1, 0xc2]); // baseline, extended sequential, progressive: what browsers show
const SOF_OTHER = new Set([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]); // lossless / arithmetic / hierarchical: valid JPEG, but not displayable

/** EXIF Orientation (1-8) from an APP1 segment body, or null when this APP1 is not EXIF, or 1 when EXIF has no (readable) orientation. */
function exifOrientation(seg) {
  if (seg.length < 6 || ascii(seg, 0, 6) !== 'Exif\0\0') return null;
  const tiff = seg.subarray(6);
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return 1;
  const le = order === 'II';
  const u16 = (at) => (at + 2 <= tiff.length ? (le ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at)) : null);
  const u32 = (at) => (at + 4 <= tiff.length ? (le ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at)) : null);
  if (u16(2) !== 42) return 1;
  const ifd = u32(4);
  if (ifd === null) return 1;
  const count = u16(ifd);
  if (count === null) return 1;
  for (let i = 0; i < Math.min(count, 64); i += 1) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) === 0x0112) { // Orientation, stored as a SHORT
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/** The marker (second byte) that starts the next segment, skipping fill bytes. */
async function nextSegmentMarker(r) {
  if ((await r.byte()) !== 0xff) throw malformed(); // between segments there must be a marker
  let marker = await r.byte();
  while (marker === 0xff) marker = await r.byte();
  if (marker === 0x00) throw malformed();
  return marker;
}

async function checkJpeg(r) {
  await r.take(2); // FF D8
  let frame = null;
  let orientation = null;
  let scans = 0;
  let marker = null; // a marker already read at the end of scan data
  for (;;) {
    const m = marker ?? await nextSegmentMarker(r);
    marker = null;
    if (m === 0xd9) { // end of image
      if (!frame || scans === 0) throw malformed();
      const o = orientation ?? 1;
      return o >= 5 ? { width: frame.height, height: frame.width } : frame; // 5-8 are stored sideways; a visitor sees them turned
    }
    if (m === 0xd8) throw malformed();
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue; // markers without a length
    const length = (await r.take(2)).readUInt16BE(0);
    if (length < 2) throw malformed();
    const size = length - 2;

    if (SOF_SUPPORTED.has(m) || SOF_OTHER.has(m)) {
      if (frame) throw malformed();
      const body = await r.take(size);
      if (size < 6) throw malformed();
      const [precision, components] = [body[0], body[5]];
      frame = { height: body.readUInt16BE(1), width: body.readUInt16BE(3) };
      if ((precision !== 8 && precision !== 12) || components < 1 || components > 4 || size !== 6 + 3 * components) throw malformed();
      checkSize(frame.width, frame.height);
      if (!SOF_SUPPORTED.has(m)) throw new Invalid('unsupported');
    } else if (m === 0xda) { // start of scan: header, then entropy-coded data up to the next real marker
      if (!frame) throw malformed();
      const body = await r.take(size);
      if (size < 1 || !(body[0] >= 1 && body[0] <= 4) || size !== 4 + 2 * body[0]) throw malformed();
      scans += 1;
      marker = await r.nextScanMarker();
    } else if (m === 0xe1) { // APP1: EXIF (the first one counts) or XMP
      const body = await r.take(size);
      if (orientation === null) orientation = exifOrientation(body);
    } else {
      await r.skip(size); // APPn, COM, DQT, DHT, DRI ... whatever their size
    }
  }
}

// ---------------------------------------------------------------- public
/** Checks a whole file against the type the upload announced. See the top of this file. */
export async function inspectImage(source, declaredType, { maxBytes } = {}) {
  if (source == null || typeof source === 'string') return { ok: false, reason: 'not_an_image' };
  const iterable = source instanceof Uint8Array ? [source] : source;
  if (typeof iterable[Symbol.asyncIterator] !== 'function' && typeof iterable[Symbol.iterator] !== 'function') return { ok: false, reason: 'not_an_image' };

  const reader = new Reader(iterable, maxBytes);
  try {
    const type = sniffType(await reader.peek(12));
    if (!type) return { ok: false, reason: 'not_an_image' };
    if (type !== declaredType) return { ok: false, reason: 'type_mismatch' };
    const size = await (type === 'image/jpeg' ? checkJpeg : type === 'image/png' ? checkPng : checkWebp)(reader);
    return { ok: true, type, width: size.width, height: size.height };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, reason: err.reason };
    throw err; // the SOURCE failed (network, storage): not a verdict on the file
  } finally {
    await reader.close();
  }
}
