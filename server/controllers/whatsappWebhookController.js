import { Notification, WhatsAppOptOut } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { applyStatus, parseWebhook, safeEqual, verifySignature } from '../utils/whatsappWebhook.js';
import { isPermanentDataError, storeIncomingMessage } from '../utils/whatsappInbox.js';
import { applyOutgoingStatus } from '../utils/whatsappReplies.js';
import { safeLinkWhatsApp } from '../utils/clients.js';

// GET /api/webhooks/whatsapp   → the one-time handshake when you register the webhook in Meta's dashboard
export const verifyHandshake = (req, res) => {
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expected && req.query['hub.mode'] === 'subscribe' && safeEqual(req.query['hub.verify_token'], expected)) {
    return res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
  }
  return res.sendStatus(403);
};

// POST /api/webhooks/whatsapp  → customer messages (stored in the inbox), delivery reports ("sent / delivered / read / failed"), STOP / START replies
// The body arrives RAW (see the route) because the signature is calculated over the exact bytes Meta sent.
export const receiveEvents = asyncHandler(async (req, res) => {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error('[whatsapp] webhook ignored: WHATSAPP_APP_SECRET is not set, so the sender cannot be verified');
    return res.sendStatus(503);
  }
  if (!verifySignature(req.body, req.get('X-Hub-Signature-256'), secret)) return res.sendStatus(401); // not from Meta: ignore

  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
  const { statuses, optOuts, optIns, incoming } = parseWebhook(payload);

  // Customer messages: each one is stored once (see utils/whatsappInbox.js). One bad message never stops the others.
  // A database problem is remembered and answered with a 500 at the end, so Meta sends the whole payload again; everything below is safe to repeat.
  // Logs name the kind of error only: never a phone number, name, text or message id.
  let notStored = 0;
  for (const message of incoming) {
    try {
      const { outcome } = await storeIncomingMessage(message);
      if (outcome === 'invalid') console.error('[whatsapp] skipped an incoming message that cannot be stored (unusable data)');
      else await safeLinkWhatsApp(message); // CRM: find or create the client and link the conversation. Runs AFTER the message is stored, never throws, never changes what Meta is answered.
    } catch (err) {
      if (isPermanentDataError(err)) {
        console.error(`[whatsapp] skipped an incoming message that cannot be stored (${err.name})`); // retrying could never fix it
      } else {
        notStored += 1;
        console.error(`[whatsapp] could not store an incoming message (${err?.name ?? 'Error'})`);
      }
    }
  }

  for (const report of statuses) {
    const log = await Notification.findOne({ waMessageId: report.id });
    if (!log) { await applyOutgoingStatus(report); continue; } // not a booking notification: maybe a reply sent from the admin inbox (otherwise ignored)
    const next = applyStatus(log.status, report.status);
    if (!next) continue;
    log.status = next;
    if (next === 'delivered' || next === 'read') log.lastError = ''; // it got through after all: drop the old failure text
    if (next === 'delivered') log.deliveredAt = report.at ?? new Date();
    if (next === 'read') { log.readAt = report.at ?? new Date(); log.deliveredAt ??= report.at ?? new Date(); }
    if (next === 'failed') log.lastError = report.error || 'WhatsApp could not deliver the message.';
    await log.save();
  }

  for (const phone of optOuts) await WhatsAppOptOut.updateOne({ phone }, { $setOnInsert: { phone, source: 'whatsapp-stop' } }, { upsert: true });
  for (const phone of optIns) await WhatsAppOptOut.deleteOne({ phone });

  if (notStored) {
    console.error(`[whatsapp] ${notStored} incoming message(s) could not be stored: answering 500 so Meta retries`);
    return res.sendStatus(500);
  }

  return res.sendStatus(200); // quickly, or Meta keeps re-sending
});
