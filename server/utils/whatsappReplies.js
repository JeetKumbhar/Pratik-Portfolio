import { httpError } from './httpError.js';
import { previewOf } from './whatsappInbox.js';
import { applyStatus } from './whatsappWebhook.js';

/**
 * The admin side of the WhatsApp inbox: list conversations, open one, mark it read, and REPLY.
 *
 * Replying, step by step (sendReply):
 *   1. The text is checked (not empty, at most MAX_REPLY_LENGTH characters) and the reply needs a clientRequestId,
 *      an id the admin screen makes once per reply.
 *   2. The customer must not have sent STOP, and WhatsApp's 24-hour window must be open: free text is only allowed
 *      within 24 hours of the customer's last message. (We stop 1 minute early so we never race the deadline.)
 *   3. The reply is saved FIRST as "sending". The unique clientRequestId means a double click, a retry or two browser tabs
 *      can never send the same reply twice: the second attempt just gets the first one back.
 *   4. Then WhatsApp is called. Accepted → "sent" (the webhook later moves it to delivered / read). Refused → "failed"
 *      with a plain-language reason the admin can read. Nothing here ever logs a phone number, text or token.
 *
 * Known edge: if the server dies after WhatsApp accepted the message but before we recorded it, the reply stays "sending"
 * (the customer did get it). The admin can see this and must NOT re-send it.
 *
 * Dependencies come in through getDeps() ({ models, sendText, now }) so all of this can be tested without a database or network.
 */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
const WINDOW_SAFETY_MS = 60 * 1000;
export const MAX_REPLY_LENGTH = 1500; // WhatsApp allows 4096, but the server's JSON limit is 10 KB and Marathi/Hindi/emoji take 3-4 bytes each
const ID_RE = /^[a-f\d]{24}$/i;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const publicConversation = (c) => ({
  id: String(c._id), phone: c.phone, name: c.name || '', lastMessagePreview: c.lastMessagePreview || '',
  lastMessageAt: c.lastMessageAt ?? null, lastMessageDirection: c.lastMessageDirection ?? null, unreadCount: c.unreadCount ?? 0, status: c.status,
});
const publicMessage = (m) => ({
  id: String(m._id), direction: m.direction, type: m.type, text: m.text ?? null, waTimestamp: m.waTimestamp,
  ...(m.direction === 'outgoing' && { deliveryStatus: m.deliveryStatus, errorText: m.errorText || '' }),
});

export function createReplies(getDeps) {
  async function loadConversation(models, id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw httpError(404, 'Conversation not found');
    const conversation = await models.WhatsAppConversation.findById(id);
    if (!conversation) throw httpError(404, 'Conversation not found');
    return conversation;
  }

  async function replyWindow({ models, now }, conversation) {
    const last = await models.WhatsAppMessage.findOne({ conversationId: conversation._id, direction: 'incoming' }).sort({ waTimestamp: -1 }).lean();
    if (!last) return { open: false, expiresAt: null };
    const expiresAt = new Date(+new Date(last.waTimestamp) + REPLY_WINDOW_MS);
    return { open: +now() < +expiresAt - WINDOW_SAFETY_MS, expiresAt };
  }

  /** { page, limit, search, unreadOnly } → conversations, newest activity first, plus counts for the tabs and the sidebar badge */
  async function listConversations({ page = 1, limit = 30, search = '', unreadOnly = false } = {}) {
    const { models } = await getDeps();
    const C = models.WhatsAppConversation;
    const p = Math.max(1, Math.floor(Number(page)) || 1);
    const l = Math.min(100, Math.max(1, Math.floor(Number(limit)) || 30));
    const filter = {};
    const term = String(search).trim().slice(0, 50);
    if (term) {
      const digits = term.replace(/\D/g, '');
      filter.$or = [{ name: { $regex: escapeRegex(term), $options: 'i' } }, ...(digits.length >= 3 ? [{ phone: { $regex: escapeRegex(digits) } }] : [])];
    }
    if (unreadOnly) filter.unreadCount = { $gt: 0 };

    const [rows, total, all, unreadRows] = await Promise.all([
      C.find(filter).sort({ lastMessageAt: -1, _id: -1 }).skip((p - 1) * l).limit(l).lean(),
      C.countDocuments(filter),
      C.countDocuments({}),
      C.find({ unreadCount: { $gt: 0 } }).select('unreadCount').lean(),
    ]);
    return {
      data: rows.map(publicConversation), total, page: p, pages: Math.max(1, Math.ceil(total / l)),
      counts: { all, unread: unreadRows.length, unreadMessages: unreadRows.reduce((n, c) => n + (c.unreadCount || 0), 0) },
    };
  }

  /** The number for the sidebar badge */
  async function unreadTotal() {
    const { models } = await getDeps();
    const rows = await models.WhatsAppConversation.find({ unreadCount: { $gt: 0 } }).select('unreadCount').lean();
    return rows.reduce((n, c) => n + (c.unreadCount || 0), 0);
  }

  /** One conversation with its newest `limit` messages (oldest first), whether replying is possible right now, and why not */
  async function getThread(id, { limit = 100 } = {}) {
    const deps = await getDeps();
    const { models } = deps;
    const conversation = await loadConversation(models, id);
    const l = Math.min(200, Math.max(1, Math.floor(Number(limit)) || 100));
    const [newestFirst, window, optOut] = await Promise.all([
      models.WhatsAppMessage.find({ conversationId: conversation._id }).sort({ waTimestamp: -1, _id: -1 }).limit(l).lean(),
      replyWindow(deps, conversation),
      models.WhatsAppOptOut.findOne({ phone: conversation.phone }).lean(),
    ]);
    return {
      conversation: publicConversation(conversation),
      messages: newestFirst.reverse().map(publicMessage),
      reply: { windowOpen: window.open, windowExpiresAt: window.expiresAt, optedOut: Boolean(optOut) },
    };
  }

  /**
   * Opening a conversation. Marks the processed incoming messages read, then sets the unread count to what is REALLY
   * unread (a recount, which also repairs the rare "one too low" case from a crash). Only 'processed' messages are touched:
   * a message still being stored by the webhook is not counted yet, so its own +1 will arrive afterwards and be correct.
   */
  async function markRead(id) {
    const { models, now } = await getDeps();
    const conversation = await loadConversation(models, id);
    const M = models.WhatsAppMessage;
    await M.updateMany({ conversationId: conversation._id, direction: 'incoming', processingStatus: 'processed', readAt: null }, { $set: { readAt: now() } });
    const unread = await M.countDocuments({ conversationId: conversation._id, direction: 'incoming', processingStatus: 'processed', readAt: null });
    await models.WhatsAppConversation.updateOne({ _id: conversation._id }, { $set: { unreadCount: unread } });
    return { unreadCount: unread };
  }

  /**
   * { text, clientRequestId } → { message, failed, duplicate }
   *   failed: true  means WhatsApp refused it (message.errorText says why); the row is saved so the admin sees it
   * Throws httpError for: bad input (400), no such conversation (404), customer sent STOP (403), window closed (409), not configured (503).
   */
  async function sendReply(id, { text, clientRequestId } = {}) {
    const deps = await getDeps();
    const { models, sendText, now, isConfigured } = deps;

    if (typeof text !== 'string' || !text.trim()) throw httpError(400, 'Type a reply first.');
    if (Array.from(text).length > MAX_REPLY_LENGTH) throw httpError(400, `A reply can be at most ${MAX_REPLY_LENGTH} characters.`);
    if (typeof clientRequestId !== 'string' || !REQUEST_ID_RE.test(clientRequestId)) throw httpError(400, 'Missing or invalid clientRequestId.');

    const conversation = await loadConversation(models, id);
    const M = models.WhatsAppMessage;

    // A repeat of a reply we already handled: hand back the first one, send nothing
    const earlier = await M.findOne({ clientRequestId }).lean();
    if (earlier) return { message: publicMessage(earlier), failed: earlier.deliveryStatus === 'failed', duplicate: true };

    if (await models.WhatsAppOptOut.findOne({ phone: conversation.phone }).lean()) {
      throw httpError(403, 'This customer sent STOP, so no messages can be sent to them. They can send START to opt in again.');
    }
    if (!(await replyWindow(deps, conversation)).open) {
      throw httpError(409, "The 24-hour reply window has closed. WhatsApp only allows free-text replies within 24 hours of the customer's last message.");
    }
    if (!isConfigured()) throw httpError(503, 'WhatsApp is not configured on the server.');

    const sentAt = now();
    let row;
    try {
      row = await M.create({
        conversationId: conversation._id, waMessageId: `pending:${clientRequestId}`, phone: conversation.phone, direction: 'outgoing',
        type: 'text', text, waTimestamp: sentAt, processingStatus: 'processed', deliveryStatus: 'sending', clientRequestId,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const raced = await M.findOne({ clientRequestId }).lean(); // another request saved the same reply a moment ago
      if (!raced) throw err;
      return { message: publicMessage(raced), failed: raced.deliveryStatus === 'failed', duplicate: true };
    }

    try {
      const { messageId } = await sendText({ to: conversation.phone, body: text });
      try {
        await M.updateOne({ _id: row._id, deliveryStatus: 'sending' }, { $set: { waMessageId: messageId, deliveryStatus: 'sent' } });
      } catch (err) {
        console.error(`[whatsapp] a reply was sent but its WhatsApp id could not be recorded (${err?.name ?? 'Error'})`);
      }
      try {
        await models.WhatsAppConversation.updateOne(
          { _id: conversation._id, $or: [{ lastMessageAt: null }, { lastMessageAt: { $lte: sentAt } }] },
          { $set: { lastMessagePreview: previewOf('text', text), lastMessageAt: sentAt, lastMessageDirection: 'outgoing' } }
        );
      } catch (err) {
        console.error(`[whatsapp] a reply was sent but the conversation summary could not be updated (${err?.name ?? 'Error'})`);
      }
      return { message: publicMessage({ ...plain(row), deliveryStatus: 'sent' }), failed: false, duplicate: false };
    } catch (err) {
      const reason = err?.name === 'WhatsAppError' ? err.safeMessage : 'The reply could not be sent.';
      if (err?.name !== 'WhatsAppError') console.error(`[whatsapp] unexpected problem while sending a reply (${err?.name ?? 'Error'})`);
      try {
        await M.updateOne({ _id: row._id, deliveryStatus: 'sending' }, { $set: { deliveryStatus: 'failed', errorText: reason.slice(0, 200) } });
      } catch (e) {
        console.error(`[whatsapp] a failed reply could not be marked as failed (${e?.name ?? 'Error'})`);
      }
      return { message: publicMessage({ ...plain(row), deliveryStatus: 'failed', errorText: reason.slice(0, 200) }), failed: true, duplicate: false };
    }
  }

  /** A delivery report arrived for a message WE sent from the app: move its status forward (never backwards). Returns true if it was one of ours. */
  async function applyOutgoingStatus(report) {
    const { models } = await getDeps();
    const M = models.WhatsAppMessage;
    const msg = await M.findOne({ waMessageId: report.id, direction: 'outgoing' });
    if (!msg) return false;
    const next = applyStatus(msg.deliveryStatus, report.status);
    if (!next) return true;
    const set = { deliveryStatus: next, errorText: next === 'failed' ? (report.error || 'WhatsApp could not deliver the message.').slice(0, 200) : '' };
    await M.updateOne({ _id: msg._id, deliveryStatus: msg.deliveryStatus }, { $set: set }); // only if nobody moved it meanwhile
    return true;
  }

  return { listConversations, unreadTotal, getThread, markRead, sendReply, applyOutgoingStatus };
}

const plain = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject() : doc);

// ---------------------------------------------------------------------- the real thing (loaded on first use)
let deps;
const realDeps = async () => {
  if (!deps) {
    const [models, service] = await Promise.all([import('../models/index.js'), import('../services/whatsappService.js')]);
    deps = { models, sendText: service.sendText, isConfigured: service.isConfigured, now: () => new Date() };
  }
  return deps;
};

export const { listConversations, unreadTotal, getThread, markRead, sendReply, applyOutgoingStatus } = createReplies(realDeps);
