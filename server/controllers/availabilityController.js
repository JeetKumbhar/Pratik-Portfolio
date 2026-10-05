import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { isDateKey } from '../utils/validators.js';
import { getDaySlots, getMonthAvailability } from '../utils/availability.js';

// @route GET /api/availability?year=2026&month=10   (month is 1 to 12)   (public)
// → { data: { '2026-10-01': 'available' | 'limited' | 'unavailable', ... } }
export const getMonth = asyncHandler(async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const thisYear = new Date().getFullYear();

  if (!Number.isInteger(year) || year < thisYear - 1 || year > thisYear + 3) throw httpError(400, 'Invalid year');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw httpError(400, 'Month must be 1 to 12');

  res.json({ success: true, data: await getMonthAvailability(year, month - 1) });
});

// @route GET /api/availability/2026-10-12   (public)
// → { data: { date, slots: [{ time: '07:00', available: true }, ...] } }
export const getDay = asyncHandler(async (req, res) => {
  const { date } = req.params;
  if (!isDateKey(date)) throw httpError(400, 'Date must be in YYYY-MM-DD format');
  res.json({ success: true, data: { date, slots: await getDaySlots(date) } });
});
