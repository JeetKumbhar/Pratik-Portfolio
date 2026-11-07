import { TEMPLATES } from '../config/whatsappTemplates.js';

/**
 * WhatsApp notifications, kept strictly SEPARATE from bookings and messages.
 *   - Everything here is called AFTER the booking / message is saved, and it never throws: a WhatsApp problem can
 *     never fail, roll back or delay a booking (callers do not even need to wait for it).
 *   - Every send first writes a Notification row with a unique key (event + booking id). That row is what prevents
 *     duplicates, lets you retry a failure, and later receives WhatsApp's delivery reports.
 *   - "sent" only means WhatsApp ACCEPTED the message. It becomes "delivered"/"read" only via the webhook.
 *   - Customer messages need the customer's opt-in (ticked at booking) and are never sent to a number that replied STOP.
 *
 * createNotifier() takes its dependencies as a function so the logic can be tested without a database or network.
 */
const STUCK_AFTER_MS = 5 * 60 * 1000; // a "pending" row older than this is a crash leftover: it may be retried

const isRelevant = (event, record) => {
  if (event === 'booking_confirmed_customer') return record.status === 'confirmed';
  if (event === 'booking_cancelled_customer') return record.status === 'cancelled';
  return true;
};

export function createNotifier(getDeps, logger = console) {
  /** Who gets this message, or why nobody does */
  async function resolveRecipient({ models, wa }, event, record) {
    if (TEMPLATES[event].recipient === 'photographer') {
      const to = wa.normalizeInternational(process.env.PHOTOGRAPHER_WHATSAPP_NUMBER);
      return to ? { to } : { skip: 'PHOTOGRAPHER_WHATSAPP_NUMBER is missing or invalid' };
    }
    if (record.whatsappOptIn !== true) return { skip: 'the customer did not opt in to WhatsApp updates' };
    const to = wa.normalizePhone(record.phone);
    if (!to) return { skip: 'the customer phone is not a usable international number' };
    if (await models.WhatsAppOptOut.exists({ phone: to })) return { skip: 'the customer opted out (STOP)' };
    return { to };
  }

  /** One send attempt. Records the outcome on the log row; never throws for a WhatsApp failure. */
  async function attempt({ wa }, log, to, record) {
    log.attempts += 1;
    try {
      const { messageId } = await wa.sendTemplate({ to, template: log.template, params: TEMPLATES[log.event].params(record) });
      log.status = 'sent'; // accepted by WhatsApp, NOT yet delivered
      log.waMessageId = messageId;
      log.sentAt = new Date();
      log.lastError = '';
    } catch (err) {
      log.status = 'failed';
      log.lastError = err?.safeMessage ?? 'The message could not be sent.'; // already free of tokens
      logger.error(`[whatsapp] ${log.event} (${log.refLabel}) failed: ${log.lastError}`);
    }
    await log.save();
    return log;
  }

  async function dispatch(event, refType, record) {
    try {
      const deps = await getDeps();
      // Admin → Settings → Notifications: the admin can switch each message off. Nothing is logged and no dedupe key is used up,
      // so switching it back on later does not resend old events. (Without a settings dependency, as in tests, everything is on.)
      if (deps.settings && !(await deps.settings.isEventEnabled(event).catch(() => true))) {
        logger.info(`[whatsapp] ${event} skipped: switched off in Settings`);
        return { status: 'disabled' };
      }
      if (!deps.wa.isConfigured()) return { status: 'not_configured' };

      const target = await resolveRecipient(deps, event, record);
      if (target.skip) {
        logger.info(`[whatsapp] ${event} skipped: ${target.skip}`);
        return { status: 'skipped', reason: target.skip };
      }

      let log;
      try {
        log = await deps.models.Notification.create({
          event,
          dedupeKey: `${event}:${record._id}`, // one notification per event per booking/message, ever
          refType,
          refId: record._id,
          refLabel: refType === 'booking' ? record.bookingId : 'Contact message',
          recipientRole: TEMPLATES[event].recipient,
          recipientHint: `****${target.to.slice(-4)}`, // the full number is not kept
          template: event,
        });
      } catch (err) {
        if (err?.code === 11000) return { status: 'duplicate' }; // already sent (or being sent): do nothing
        throw err;
      }

      const done = await attempt(deps, log, target.to, record);
      return { status: done.status, id: String(done._id) };
    } catch (err) {
      logger.error(`[whatsapp] ${event} could not be processed: ${err?.message ?? err}`);
      return { status: 'error' };
    }
  }

  // ------------------------------------------------------------------ the five events
  /** A booking was saved: tell the photographer first, then (if they opted in) the customer. */
  async function notifyBookingCreated(booking) {
    const admin = await dispatch('new_booking_admin', 'booking', booking);
    const customer = await dispatch('booking_received_customer', 'booking', booking);
    return { admin, customer };
  }

  /** The admin changed a booking's status: confirmed and cancelled tell the customer. */
  async function notifyBookingStatusChanged(booking) {
    if (booking.status === 'confirmed') return dispatch('booking_confirmed_customer', 'booking', booking);
    if (booking.status === 'cancelled') return dispatch('booking_cancelled_customer', 'booking', booking);
    return { status: 'ignored' };
  }

  /** A contact-form message was saved: tell the photographer. */
  const notifyNewMessage = (message) => dispatch('new_message_admin', 'message', message);

  // ------------------------------------------------------------------ retrying
  /** Retry a failed (or crash-stuck) notification. outcome: done | not_found | not_retryable | not_configured */
  async function retryNotification(id) {
    const deps = await getDeps();
    const { models, wa } = deps;
    if (!wa.isConfigured()) return { outcome: 'not_configured' };

    const log = await models.Notification.findById(id);
    if (!log) return { outcome: 'not_found' };
    const stuck = log.status === 'pending' && Date.now() - new Date(log.updatedAt).getTime() > STUCK_AFTER_MS;
    if (log.status !== 'failed' && !stuck) return { outcome: 'not_retryable', log };

    const skip = async (reason) => { log.status = 'skipped'; log.lastError = reason; await log.save(); return { outcome: 'done', log }; };

    // Rebuild everything from the current booking / message: the log keeps no personal data
    const record = await (log.refType === 'booking' ? models.Booking : models.Message).findById(log.refId);
    if (!record) return skip('The booking or message no longer exists.');
    if (!isRelevant(log.event, record)) return skip(`No longer relevant: the booking is now ${record.status}.`);
    const target = await resolveRecipient(deps, log.event, record);
    if (target.skip) return skip(`Not sent: ${target.skip}.`);

    await attempt(deps, log, target.to, record);
    return { outcome: 'done', log };
  }

  return { notifyBookingCreated, notifyBookingStatusChanged, notifyNewMessage, retryNotification };
}

// ---------------------------------------------------------------------- the real thing (database + WhatsApp, loaded on first use)
let deps;
const realDeps = async () => {
  deps ??= { models: await import('../models/index.js'), wa: await import('../services/whatsappService.js'), settings: await import('./settings.js') };
  return deps;
};
const notifier = createNotifier(realDeps);

export const { notifyBookingCreated, notifyBookingStatusChanged, notifyNewMessage, retryNotification } = notifier;
