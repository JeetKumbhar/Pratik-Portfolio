/**
 * STATIC availability + fake submit, so the whole UI can be built first.
 *
 * Later (MongoDB), keep the same function names and return shapes:
 *   getAvailability(year, monthIndex) → GET  /api/availability?year=&month=     → { 'YYYY-MM-DD': 'available'|'limited'|'unavailable' }
 *   getTimeSlots(dateKey)             → GET  /api/availability/:date            → [{ time:'14:00', available:true }]
 *   submitBooking(payload)            → POST /api/bookings                      → { reference }
 */
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
// deterministic pseudo-random 0..1 so the demo calendar looks the same on every load
const seed = (a, b = 0) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;

const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };

function dayStatus(y, m, d) {
  if (new Date(y, m, d) <= startOfToday()) return 'unavailable'; // past + today
  const r = seed(d, m + 1);
  if (r < 0.12) return 'unavailable';
  if (r < 0.3) return 'limited';
  return 'available';
}

export async function getAvailability(year, monthIndex) {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const map = {};
  for (let d = 1; d <= days; d += 1) map[keyOf(year, monthIndex, d)] = dayStatus(year, monthIndex, d);
  return map;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00 → 21:00

export async function getTimeSlots(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const status = dayStatus(y, m - 1, d);
  const takenChance = status === 'limited' ? 0.5 : 0.2;
  return HOURS.map((h) => ({
    time: `${pad(h)}:00`,
    available: status !== 'unavailable' && seed(d * 31 + m, h) >= takenChance,
  }));
}

export async function submitBooking(payload) {
  await new Promise((resolve) => setTimeout(resolve, 900));
  if (import.meta.env.DEV) console.info('[booking] UI-only, not sent:', payload);
  const reference = `AM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  return { reference };
}
