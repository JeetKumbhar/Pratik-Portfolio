/**
 * Turns the dashboard data into a short "what needs my attention" list.
 * Pure function (no React, no network), so it is easy to test.
 *   stats  = GET /api/bookings/stats      recent = GET /api/bookings (newest first)
 * Returns [{ id, kind: 'pending' | 'shoot' | 'new', title, detail, to }]  (max 6)
 */
const DAY = 24 * 60 * 60 * 1000;
const toDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const fmtTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export function dayLabel(dateKey, now = new Date()) {
  const diff = Math.round((toDate(dateKey) - startOfDay(now)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return toDate(dateKey).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function timeAgo(iso, now = new Date()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso)) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function buildNotifications({ stats, recent = [], now = new Date() }) {
  const items = [];

  if (stats?.pending > 0) {
    items.push({
      id: 'pending', kind: 'pending',
      title: `${stats.pending} booking request${stats.pending === 1 ? '' : 's'} waiting for your reply`,
      detail: 'Customers are expecting an answer within 24 hours.',
      to: '/admin/bookings?status=pending',
    });
  }

  // Shoots in the next 7 days
  (stats?.next ?? []).forEach((b) => {
    const diff = Math.round((toDate(b.date) - startOfDay(now)) / DAY);
    if (diff < 0 || diff > 7) return;
    items.push({
      id: `shoot-${b.reference}`, kind: 'shoot',
      title: `${dayLabel(b.date, now)} at ${fmtTime(b.time)}: ${b.name}`,
      detail: `${b.shootType.replace('-', ' ')} shoot${b.status === 'pending' ? ' (not confirmed yet)' : ''}`,
      to: `/admin/bookings?view=${b.reference}`,
    });
  });

  // Requests that arrived in the last 24 hours
  recent
    .filter((b) => b.status === 'pending' && now - new Date(b.createdAt) < DAY)
    .forEach((b) => {
      items.push({
        id: `new-${b.reference}`, kind: 'new',
        title: `New request from ${b.name}`,
        detail: `${b.reference} · ${timeAgo(b.createdAt, now)}`,
        to: `/admin/bookings?view=${b.reference}`,
      });
    });

  return items.slice(0, 6);
}
