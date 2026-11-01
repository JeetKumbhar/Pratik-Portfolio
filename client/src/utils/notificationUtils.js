/** Labels and rules for the Admin > Notifications screen. Pure, no React. */
export const EVENT_LABELS = {
  booking_received_customer: 'Booking received (to customer)',
  new_booking_admin: 'New booking (to you)',
  booking_confirmed_customer: 'Booking confirmed (to customer)',
  booking_cancelled_customer: 'Booking cancelled (to customer)',
  new_message_admin: 'New contact message (to you)',
};

// "sent" means WhatsApp ACCEPTED the message. Only a delivery report can turn it into "delivered".
export const STATUS_META = {
  pending: { label: 'Pending', variant: 'warning', hint: 'Being sent.' },
  sent: { label: 'Sent to WhatsApp', variant: 'neutral', hint: 'WhatsApp accepted it. Delivery to the phone is confirmed later (needs the webhook).' },
  delivered: { label: 'Delivered', variant: 'success', hint: 'It reached the phone.' },
  read: { label: 'Read', variant: 'success', hint: 'The recipient opened it.' },
  failed: { label: 'Failed', variant: 'danger', hint: 'It was not sent. You can retry it.' },
  skipped: { label: 'Skipped', variant: 'neutral', hint: 'Deliberately not sent (no longer relevant, customer opted out, ...).' },
};

export const TABS = [
  { value: '', label: 'All', stat: 'all' },
  { value: 'failed', label: 'Failed', stat: 'failed' },
  { value: 'sent', label: 'Sent', stat: 'sent' },
  { value: 'delivered', label: 'Delivered', stat: 'delivered' },
  { value: 'read', label: 'Read', stat: 'read' },
  { value: 'skipped', label: 'Skipped', stat: 'skipped' },
];

const STUCK_AFTER_MS = 5 * 60 * 1000;

/** The Retry button shows for failed notifications, and for ones stuck in "pending" (the server stopped mid-send) */
export function canRetry(notification, now = new Date()) {
  if (notification.status === 'failed') return true;
  return notification.status === 'pending' && now - new Date(notification.updatedAt) > STUCK_AFTER_MS;
}

/** A sentence about what is missing, for the setup banner (null = all fine) */
export function setupProblem(config) {
  if (!config) return null;
  if (!config.configured) return { level: 'warn', text: `WhatsApp is not connected yet. Missing: ${config.missing.join(', ')}.` };
  if (!config.photographerNumberSet) return { level: 'warn', text: 'WhatsApp is connected, but PHOTOGRAPHER_WHATSAPP_NUMBER is missing or has no country code, so you will not be notified.' };
  if (!config.webhook.appSecretSet || !config.webhook.verifyTokenSet) return { level: 'info', text: 'Messages are sent, but delivery status and customers\' STOP replies are not tracked until the webhook is set up.' };
  return null;
}
