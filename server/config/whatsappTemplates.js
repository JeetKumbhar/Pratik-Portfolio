/**
 * The five WhatsApp messages. Business-initiated WhatsApp messages must be sent as pre-approved TEMPLATES,
 * so each one is defined here exactly as it must be created in Meta's WhatsApp Manager:
 *   - `body` uses {{1}}, {{2}} … for the parts that change (npm run whatsapp:templates prints them ready to copy)
 *   - `params(record)` returns the values for {{1}}, {{2}} … in the same order
 *   - `example` is the sample set Meta asks for when you submit the template
 * The template NAME is the event name. If you change a body here, create/re-approve the template in Meta with the same text.
 * Pure functions: no database, no network.
 */

/** One line of plain text, safe for a template parameter (WhatsApp rejects line breaks, tabs and long runs of spaces). */
export function cleanParam(value, max = 60) {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (!text) return '-'; // an empty parameter is rejected by WhatsApp
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const photographerName = () => cleanParam(process.env.PHOTOGRAPHER_NAME || 'Alex Morgan', 40);
const prettyType = (type) => {
  const words = String(type ?? '').replace(/-/g, ' ');
  return cleanParam(words.charAt(0).toUpperCase() + words.slice(1) || '-', 30); // pre-wedding → "Pre wedding"
};
const longDate = (key) => {
  const [y, m, d] = String(key ?? '').split('-').map(Number);
  if (!y || !m || !d) return '-';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};
const clock = (time) => {
  const [h, m] = String(time ?? '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '-';
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export const TEMPLATES = {
  // ---------------------------------------------------------------- customer
  booking_received_customer: {
    recipient: 'customer',
    category: 'UTILITY',
    body: [
      'Hello {{1}}!', '',
      'Thank you for choosing {{2}} Photography.', '',
      'We have received your booking request.', '',
      '- Booking ID: {{3}}', '- Shoot Type: {{4}}', '- Requested Date: {{5}}', '- Package: {{6}}', '',
      'Your booking is awaiting confirmation. We will update you once it is confirmed.', '',
      'Thank you!',
    ].join('\n'),
    params: (b) => [cleanParam(b.name), photographerName(), cleanParam(b.bookingId), prettyType(b.shootType), longDate(b.date), cleanParam(b.package?.name)],
    example: ['Sarah Jones', 'Alex Morgan', 'AM-K3X9QA', 'Wedding', 'June 10, 2027', 'Standard'],
  },
  booking_confirmed_customer: {
    recipient: 'customer',
    category: 'UTILITY',
    body: [
      'Hello {{1}}!', '',
      'Your photography booking has been confirmed.', '',
      '- Booking ID: {{2}}', '- Shoot Type: {{3}}', '- Date: {{4}}', '- Time: {{5}}', '',
      'Thank you for choosing {{6}} Photography. We look forward to capturing your special moments!',
    ].join('\n'),
    params: (b) => [cleanParam(b.name), cleanParam(b.bookingId), prettyType(b.shootType), longDate(b.date), clock(b.time), photographerName()],
    example: ['Sarah Jones', 'AM-K3X9QA', 'Wedding', 'June 10, 2027', '2:00 PM', 'Alex Morgan'],
  },
  booking_cancelled_customer: {
    recipient: 'customer',
    category: 'UTILITY',
    body: [
      'Hello {{1}},', '',
      'Your booking {{2}} for {{3}} has been cancelled.', '',
      'If you have any questions or would like to discuss another date, please contact us.', '',
      'Thank you.',
    ].join('\n'),
    params: (b) => [cleanParam(b.name), cleanParam(b.bookingId), longDate(b.date)],
    example: ['Sarah Jones', 'AM-K3X9QA', 'June 10, 2027'],
  },

  // ---------------------------------------------------------------- photographer
  new_booking_admin: {
    recipient: 'photographer',
    category: 'UTILITY',
    body: [
      'New booking request received!', '',
      '- Booking ID: {{1}}', '- Customer: {{2}}', '- Phone: {{3}}', '- Shoot Type: {{4}}', '- Requested Date: {{5}}', '- Package: {{6}}', '',
      'Please open the Admin Panel to review and confirm the booking.',
    ].join('\n'),
    params: (b) => [cleanParam(b.bookingId), cleanParam(b.name), cleanParam(b.phone, 30), prettyType(b.shootType), longDate(b.date), cleanParam(b.package?.name)],
    example: ['AM-K3X9QA', 'Sarah Jones', '+1 123 456 7890', 'Wedding', 'June 10, 2027', 'Standard'],
  },
  new_message_admin: {
    recipient: 'photographer',
    category: 'UTILITY',
    body: [
      'New message received through your photography website.', '',
      '- Name: {{1}}', '- Phone: {{2}}', '- Email: {{3}}', '- Message: {{4}}', '',
      'Open the Admin Panel to review the complete message.',
    ].join('\n'),
    params: (m) => [cleanParam(m.name), cleanParam(m.phone, 30), cleanParam(m.email, 80), cleanParam(m.message, 100)],
    example: ['Sarah Jones', '+1 123 456 7890', 'sarah@example.com', 'Hi! Are you free in June for a wedding?'],
  },
};

export const EVENT_LABELS = {
  booking_received_customer: 'Booking received (to customer)',
  new_booking_admin: 'New booking (to you)',
  booking_confirmed_customer: 'Booking confirmed (to customer)',
  booking_cancelled_customer: 'Booking cancelled (to customer)',
  new_message_admin: 'New contact message (to you)',
};

/** How many {{n}} placeholders a body has (the highest number) */
export const placeholderCount = (body) => Math.max(0, ...[...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
