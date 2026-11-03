import { normalizeInternational } from '../services/whatsappService.js';
import { WA_MESSAGE_TYPES } from '../config/constants.js';

/**
 * Stores an incoming WhatsApp customer message: finds or creates the customer's conversation, saves the message once,
 * and keeps the conversation's unread count and "last message" summary up to date.
 *
 * Meta can deliver the same webhook several times, even at the same moment, so everything here is safe to repeat.
 * Only single-document atomic operations and unique indexes are used (no transactions):
 *
 *   1. Conversation: an upsert on the UNIQUE phone number (if two requests race, the loser gets a duplicate-key error and just retries).
 *   2. Message: an insert with a UNIQUE waMessageId. A repeat delivery gets a duplicate-key error and creates nothing.
 *   3. Unread count: "received → counted" is an atomic claim on the message. Only the request that wins the claim adds 1,
 *      so repeats and racing duplicates can never count a message twice.
 *   4. Summary: the conversation's last-message fields are set only if this message is the newest one known (so a late
 *      delivery cannot overwrite a newer message), then the message becomes "processed".
 *
 * A repeat that finds a half-finished message (the server stopped midway last time) simply finishes the remaining steps.
 * The one trade-off: if the server dies in the few milliseconds between winning the claim (3) and adding 1, the unread count
 * stays one too LOW. It can never be one too high. Phase 3's "mark as read" can recount from the messages to repair it.
 *
 * Nothing here logs, so no phone number, name, text or message id can leak into a log. Dependencies come in through
 * getDeps() (like notificationHelper.js) so the logic can be tested without a database.
 */
const PREVIEW_LENGTH = 100;
const PREVIEW_LABELS = {
  image: '[Image]', audio: '[Audio]', video: '[Video]', document: '[Document]', location: '[Location]',
  sticker: '[Sticker]', contacts: '[Contact]', interactive: '[Reply]', unknown: '[Unsupported message]',
};

/** WhatsApp's own word for the type → one of ours. Anything else is 'unknown' (its original word is kept as rawType). */
export function toStoredType(metaType) {
  const known = WA_MESSAGE_TYPES.includes(metaType) && metaType !== 'unknown';
  return known ? { type: metaType } : { type: 'unknown', rawType: String(metaType ?? '').slice(0, 40) || undefined };
}

/** One short line for the conversation list. Text is flattened to one line and cut by whole characters (emoji are never split). */
export function previewOf(type, text) {
  if (type !== 'text') return PREVIEW_LABELS[type] ?? PREVIEW_LABELS.unknown;
  const oneLine = String(text ?? '').replace(/\s+/g, ' ').trim();
  return oneLine ? Array.from(oneLine).slice(0, PREVIEW_LENGTH).join('') : '[Message]';
}

const isDuplicateKey = (err) => err?.code === 11000;

/** A problem with the message's own data (retrying can never fix it), as opposed to a database or network problem. */
export const isPermanentDataError = (err) => err?.name === 'ValidationError' || err?.name === 'CastError';

export function createInbox(getDeps) {
  /** Find or create the customer's conversation (one per phone number, ever). Updates the name when a valid one is supplied. */
  async function upsertConversation({ models }, { phone, name, contactId }) {
    const set = {};
    if (name) set.name = name;
    if (contactId) set.contactId = contactId;
    const update = { $setOnInsert: { phone, status: 'open', unreadCount: 0 }, ...(Object.keys(set).length && { $set: set }) };
    const options = { upsert: true, returnDocument: 'after' };
    try {
      return await models.WhatsAppConversation.findOneAndUpdate({ phone }, update, options);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Two first messages from the same number arrived together and the other request created the conversation: take it.
      return models.WhatsAppConversation.findOneAndUpdate({ phone }, update, options);
    }
  }

  /** Steps 3 and 4. Safe to run any number of times, even at the same time, for the same message. */
  async function finish({ models }, msg) {
    const { WhatsAppConversation, WhatsAppMessage } = models;

    const claim = await WhatsAppMessage.updateOne({ _id: msg._id, processingStatus: 'received' }, { $set: { processingStatus: 'counted' } });
    if (claim.modifiedCount === 1) await WhatsAppConversation.updateOne({ _id: msg.conversationId }, { $inc: { unreadCount: 1 } });

    await WhatsAppConversation.updateOne(
      { _id: msg.conversationId, $or: [{ lastMessageAt: null }, { lastMessageAt: { $lte: msg.waTimestamp } }] },
      { $set: { lastMessagePreview: previewOf(msg.type, msg.text), lastMessageAt: msg.waTimestamp, lastMessageDirection: 'incoming' } }
    );
    await WhatsAppMessage.updateOne({ _id: msg._id, processingStatus: 'counted' }, { $set: { processingStatus: 'processed' } });
  }

  /**
   * incoming = one entry of parseWebhook().incoming: { id, from, name, type, text, at, contactId }
   * Resolves { outcome }:  'stored' (new message) · 'duplicate' (already fully processed) · 'resumed' (seen before, unfinished: finished now)
   *                        'invalid' (no usable phone number: nothing stored)
   * Throws on a database problem (the webhook then answers 500 so Meta retries).
   */
  async function storeIncomingMessage(incoming) {
    const deps = await getDeps();
    const phone = normalizeInternational(incoming?.from);
    if (!phone || typeof incoming.id !== 'string' || !incoming.id) return { outcome: 'invalid' };

    const conversation = await upsertConversation(deps, { phone, name: incoming.name, contactId: incoming.contactId });
    const stored = toStoredType(incoming.type);
    const isText = stored.type === 'text';

    let msg;
    try {
      msg = await deps.models.WhatsAppMessage.create({
        conversationId: conversation._id,
        waMessageId: incoming.id,
        phone,
        direction: 'incoming',
        type: stored.type,
        ...(stored.rawType && { rawType: stored.rawType }),
        text: isText ? incoming.text ?? null : null,
        waTimestamp: incoming.at ?? new Date(),
      });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      const existing = await deps.models.WhatsAppMessage.findOne({ waMessageId: incoming.id });
      if (!existing) throw err; // it vanished between the two calls: let Meta retry
      if (existing.processingStatus === 'processed') return { outcome: 'duplicate' };
      await finish(deps, existing);
      return { outcome: 'resumed' };
    }

    await finish(deps, msg);
    return { outcome: 'stored' };
  }

  return { storeIncomingMessage };
}

// ---------------------------------------------------------------------- the real thing (loaded on first use)
let deps;
const realDeps = async () => {
  deps ??= { models: await import('../models/index.js') };
  return deps;
};

export const { storeIncomingMessage } = createInbox(realDeps);
