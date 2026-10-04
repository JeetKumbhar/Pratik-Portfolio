import { randomInt } from 'node:crypto';

// No 0/O, 1/I/L: easy to read out over the phone
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** e.g. "AM-K3X9QA" (cryptographically random; the unique index on Booking guards the rare collision) */
export function generateBookingId() {
  let id = '';
  for (let i = 0; i < 6; i += 1) id += ALPHABET[randomInt(ALPHABET.length)];
  return `AM-${id}`;
}

export default generateBookingId;
