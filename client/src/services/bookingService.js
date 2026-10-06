import api from './api';

/**
 * Real availability from the backend (bookings + blocked dates, checked in MongoDB).
 * durationHours = how long the chosen package lasts: a longer shoot needs more free hours in a row.
 * The backend repeats the check when the booking is submitted, so this is only for showing choices.
 */

/** → { 'YYYY-MM-DD': 'available' | 'limited' | 'unavailable' }   (monthIndex is 0-based, like the calendar) */
export async function getAvailability(year, monthIndex, durationHours = 1) {
  const { data } = await api.get(`/availability?year=${year}&month=${monthIndex + 1}&duration=${durationHours}`);
  return data;
}

/** → [{ time: '07:00', available: true }, ...]   one entry per possible START time */
export async function getTimeSlots(dateKey, durationHours = 1) {
  const { data } = await api.get(`/availability/${dateKey}?duration=${durationHours}`);
  return data.slots;
}

/** → { reference }.  Throws ApiError: status 409 = slot was just taken, 400 = invalid data */
export async function submitBooking(payload) {
  const { data } = await api.post('/bookings', payload);
  return { reference: data.reference };
}
