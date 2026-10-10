/**
 * Turns one day of the admin calendar ({ bookings: [...], blocks: [...] }) into a list of events to draw.
 * Pure functions, no React. A day can hold several events, e.g. a Wedding booking AND a personal appointment.
 *   June 10 → "Wedding booking"      June 11 → "Editing"      June 12 → (nothing: available)      June 13 → "Vacation"
 */
export const BLOCK_TYPES = ['editing', 'vacation', 'personal', 'offline_booking', 'other'];

export const EVENT_TYPES = {
  booking: { label: 'Customer booking' },
  editing: { label: 'Editing' },
  vacation: { label: 'Vacation' },
  personal: { label: 'Personal day' },
  offline_booking: { label: 'Offline booking' },
  other: { label: 'Other' },
};

export const typeLabel = (type) => EVENT_TYPES[type]?.label ?? type;

/**
 * day = one entry of GET /api/availability/admin/calendar
 * shootLabel = (shootType) => 'Wedding'   (passed in so this file needs no imports)
 */
export function buildEvents(day, shootLabel = (t) => t) {
  const blocks = (day?.blocks ?? []).map((b, i) => ({
    id: `block-${b.id ?? i}`,
    kind: 'block',
    type: b.type,
    title: typeLabel(b.type),
    subtitle: b.reason || '',
    note: b.note || '',
    allDay: b.allDay,
    times: b.blockedTimes ?? [],
    blockId: b.id,
    groupId: b.groupId ?? null,
    group: b.group ?? null, // { count, start, end } when this day was blocked together with others
  }));

  const bookings = (day?.bookings ?? []).map((b) => ({
    id: `booking-${b.reference}`,
    kind: 'booking',
    type: 'booking',
    title: `${shootLabel(b.shootType)} booking`,
    subtitle: b.name,
    reference: b.reference,
    status: b.status,
    time: b.time,
    hours: b.hours,
  }));

  // whole-day blocks first, then everything by start time
  const startOf = (e) => (e.kind === 'block' ? (e.allDay ? '' : e.times[0] ?? '') : e.time ?? '');
  return [...blocks, ...bookings].sort((a, b) => startOf(a).localeCompare(startOf(b)));
}

/** The distinct event types on a day (for the little coloured dots) */
export const typesOf = (events) => [...new Set(events.map((e) => e.type))];
