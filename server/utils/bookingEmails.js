import { sendEmail } from './sendEmail.js';

// Plain text only (no HTML) so customer-supplied text can never inject markup.
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim(); // keeps email headers safe
const fmtDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};
const fmtTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const summary = (b) => [
  `Reference: ${b.bookingId}`,
  `Shoot: ${b.shootType}`,
  `Date: ${fmtDate(b.date)} at ${fmtTime(b.time)}`,
  `Location: ${b.location}${b.locationDetails ? ` (${oneLine(b.locationDetails)})` : ''}`,
  `People: ${b.numberOfPeople}`,
  `Package: ${b.package.name}${b.package.price != null ? ` ($${b.package.price})` : ' (custom quote)'}`,
].join('\n');

const adminAddress = () => process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL;

const logFailures = (results) => results.forEach((r) => {
  if (r.status === 'rejected') console.error('[email] failed:', r.reason?.message);
});

/** New request: confirmation to the customer + heads-up to the photographer. Never throws. */
export function sendBookingReceived(b) {
  const first = oneLine(b.name).split(' ')[0];
  const jobs = [
    sendEmail({
      to: b.email,
      subject: `We received your booking request (${b.bookingId})`,
      text: `Hi ${first},\n\nThanks for your request! I'll review the details and get back to you within 24 hours to confirm availability.\n\n${summary(b)}\n\nAlex Morgan Photography`,
    }),
  ];
  const admin = adminAddress();
  if (admin) {
    jobs.push(sendEmail({
      to: admin,
      subject: `New booking request ${b.bookingId}: ${oneLine(b.name)}`,
      text: `${summary(b)}\n\nCustomer: ${oneLine(b.name)}\nEmail: ${b.email}\nPhone: ${oneLine(b.phone)}\nSpecial request: ${oneLine(b.specialRequest) || '-'}`,
    }));
  }
  return Promise.allSettled(jobs).then(logFailures);
}

/** Admin confirmed or cancelled a booking → tell the customer. Other statuses send nothing. */
export function sendStatusEmail(b) {
  const first = oneLine(b.name).split(' ')[0];
  let subject;
  let text;
  if (b.status === 'confirmed') {
    subject = `Your booking is confirmed (${b.bookingId})`;
    text = `Hi ${first},\n\nGood news, your shoot is confirmed!\n\n${summary(b)}\n\nIf anything needs to change, just reply to this email.\n\nAlex Morgan Photography`;
  } else if (b.status === 'cancelled') {
    subject = `Your booking was cancelled (${b.bookingId})`;
    text = `Hi ${first},\n\nYour booking has been cancelled.\n\n${summary(b)}\n\nIf this is a surprise, please reply to this email and we'll sort it out.\n\nAlex Morgan Photography`;
  } else {
    return Promise.resolve();
  }
  return Promise.allSettled([sendEmail({ to: b.email, subject, text })]).then(logFailures);
}
