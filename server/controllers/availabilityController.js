import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { isDateKey } from '../utils/validators.js';
import { MAX_DURATION_HOURS } from '../config/constants.js';
import { getDaySlots, getMonthAvailability, getAdminMonth } from '../utils/availability.js';

// ?duration=3  → how many whole hours the shoot lasts (default 1). Longer shoots need more free hours in a row.
const parseDuration = (value) => {
  if (value === undefined) return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DURATION_HOURS) {
    throw httpError(400, `duration must be a whole number of hours from 1 to ${MAX_DURATION_HOURS}`);
  }
  return n;
};

const parseYearMonth = (query) => {
  const year = Number(query.year);
  const month = Number(query.month);
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < thisYear - 1 || year > thisYear + 3) throw httpError(400, 'Invalid year');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw httpError(400, 'Month must be 1 to 12');
  return { year, monthIndex: month - 1 };
};

// @route GET /api/availability?year=2026&month=12&duration=2     (public; month is 1 to 12)
// → { data: { '2026-12-01': 'available' | 'limited' | 'unavailable', ... } }
export const getMonth = asyncHandler(async (req, res) => {
  const { year, monthIndex } = parseYearMonth(req.query);
  res.json({ success: true, data: await getMonthAvailability(year, monthIndex, parseDuration(req.query.duration)) });
});

// @route GET /api/availability/2026-12-10?duration=2     (public)
// → { data: { date, slots: [{ time: '07:00', available: true }, ...] } }   (one entry per possible START time)
export const getDay = asyncHandler(async (req, res) => {
  const { date } = req.params;
  if (!isDateKey(date)) throw httpError(400, 'Date must be in YYYY-MM-DD format');
  const slots = await getDaySlots(date, { durationHours: parseDuration(req.query.duration) });
  res.json({ success: true, data: { date, slots } });
});

// @route GET /api/availability/admin/calendar?year=2026&month=12     (ADMIN)
// → every day with WHY: label = editing | vacation | personal | offline_booking | other | booked | partly_booked | available,
//   plus the bookings (reference, name, time) and blocks on that day. Customers never see this.
export const getAdminCalendar = asyncHandler(async (req, res) => {
  const { year, monthIndex } = parseYearMonth(req.query);
  res.json({ success: true, data: await getAdminMonth(year, monthIndex, parseDuration(req.query.duration)) });
});
