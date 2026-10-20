import { sendEmail } from './sendEmail.js';

const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim(); // keeps email headers safe

/**
 * A contact-form message arrived: tell the photographer (plain text only).
 * There is deliberately NO automatic reply to the sender: anyone can type any address into a public form,
 * and an auto-reply would let strangers use your site to send email to other people.
 * Never throws: an email problem must not make the visitor's message fail.
 */
export function sendMessageReceived(m) {
  const admin = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
  if (!admin) return Promise.resolve();

  return sendEmail({
    to: admin,
    subject: `New message from ${oneLine(m.name)}`,
    text: [
      `From: ${oneLine(m.name)} <${m.email}>`,
      `Phone: ${oneLine(m.phone) || '-'}`,
      `About: ${m.subject}`,
      '',
      m.message,
      '',
      `Reply to ${m.email}, or open Admin > Messages.`,
    ].join('\n'),
  }).catch((err) => console.error('[email] failed:', err.message));
}
