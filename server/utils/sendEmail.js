/**
 * sendEmail({ to, subject, text, html })
 *
 * No SMTP settings in .env → the email is printed in the terminal instead of sent (great for development).
 * With SMTP_HOST etc. set (run `npm i nodemailer` first) it sends for real.
 */
let transporter;

async function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return null;

  const { default: nodemailer } = await import('nodemailer'); // loaded only when needed
  const port = Number(SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendEmail({ to, subject, text, html }) {
  const t = await getTransporter();

  if (!t) {
    console.log(`\n[email: not sent, SMTP not configured]\nTo: ${to}\nSubject: ${subject}\n${text ?? ''}\n`);
    return { skipped: true };
  }

  return t.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
}

export default sendEmail;
