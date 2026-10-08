
/**
 * Booking status rules for the admin screens (the API enforces the same flow; keep both in step).
 *   pending → confirmed | cancelled      confirmed → completed | cancelled
 *   completed → final                    cancelled → pending ("reopen", only if the slot is still free)
 * Pure data and functions: no React.
 */
export const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

export const STATUS_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['pending'],
};

export const STATUS_META = {
  pending: { label: 'Pending', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  completed: { label: 'Completed', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

/** The button for moving a booking INTO each status */
export const ACTIONS = {
  confirmed: { label: 'Confirm booking', hint: 'The customer is emailed a confirmation.', style: 'primary' },
  completed: { label: 'Mark completed', hint: 'The shoot has taken place.', style: 'primary' },
  cancelled: { label: 'Cancel booking', hint: 'The customer is emailed and the time slot is freed.', style: 'danger' },
  pending: { label: 'Reopen as pending', hint: 'Only works if the time slot is still free.', style: 'ghost' },
};

export const canChange = (from, to) => (STATUS_FLOW[from] ?? []).includes(to);
export const actionsFor = (status) => (STATUS_FLOW[status] ?? []).map((to) => ({ to, ...ACTIONS[to] }));

const pad = (n) => String(n).padStart(2, '0');
/** Is the shoot date after today? (used to warn before marking a future shoot "completed") */
export const isFutureShoot = (dateKey, now = new Date()) =>
  dateKey > `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
