import { CLIENT_NAME_SOURCES } from '../config/constants.js';
import { isEmail } from './validators.js';
import { formatPhoneDisplay, normalizeClientPhone, normalizeWhatsAppPhone } from './phone.js';

/**
 * Keeps the Clients (CRM) collection in step with what customers do. One client per phone number, forever.
 *
 *   linkBookingToClient(booking)   a booking was saved   → find or create the client, attach the booking
 *   linkWhatsAppSender({phone, name})  a WhatsApp message was stored → find or create the client, attach the conversation
 *   createManualClient(...)        the admin typed a client in
 *
 * HOW DUPLICATES ARE PREVENTED
 *   The UNIQUE index on Client.normalizedPhone is the real guarantee. findOrCreateClient() looks first, then inserts;
 *   if two requests race and the loser's insert is refused (error 11000), it simply loads the winner's client.
 *   No transactions are used (the project avoids them), only single-document operations that are safe to repeat.
 *
 * HOW A CLIENT'S NAME IS PROTECTED
 *   Names have a rank: placeholder (the phone number) < whatsapp (profile name) < booking (typed on the form) < manual (admin).
 *   improveClient() only replaces a name with one of HIGHER rank, as one atomic update that checks the current rank,
 *   so a later WhatsApp message can never overwrite a name the admin typed, and a phone-number fallback never overwrites anything.
 *   Email and city are only ever filled in when empty; a different email on a later booking never replaces the client's own.
 *
 * FAILURE RULES (the customer's booking and WhatsApp message always come first)
 *   The safe* wrappers at the bottom never throw. If the CRM step fails, the booking / message is already saved and
 *   stays saved; the client is created or linked the next time that person books or writes, or by `npm run backfill:clients`.
 *   They log only the kind of error, never a name, number or email.
 *
 * Dependencies come in through getDeps() ({ models }) so all of this can be tested without a database.
 */
const RANK = Object.fromEntries(CLIENT_NAME_SOURCES.map((s, i) => [s, i]));
const lowerThan = (source) => CLIENT_NAME_SOURCES.filter((s) => RANK[s] < RANK[source]);
const isDuplicateKey = (err) => err?.code === 11000;
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createClients(getDeps) {
  /**
   * { normalizedPhone, name, nameSource, source, email?, city?, createdAt? } → { client, created }
   * Never creates a second client for the same number.
   */
  async function findOrCreateClient(input) {
    const { models } = await getDeps();
    const { Client } = models;
    const { normalizedPhone } = input;

    const existing = await Client.findOne({ normalizedPhone });
    if (existing) return { client: existing, created: false };

    const email = text(input.email, 254).toLowerCase();
    try {
      const client = await Client.create({
        name: text(input.name, 100) || formatPhoneDisplay(normalizedPhone),
        nameSource: text(input.name, 100) ? input.nameSource : 'placeholder',
        phone: formatPhoneDisplay(normalizedPhone),
        normalizedPhone,
        email: isEmail(email) ? email : '',
        city: text(input.city, 80),
        source: input.source,
        ...(input.createdAt && { createdAt: input.createdAt }),
      });
      return { client, created: true };
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      const winner = await Client.findOne({ normalizedPhone }); // someone else created it a moment ago: use theirs
      if (!winner) throw err; // it vanished again: let the caller's retry path handle it
      return { client: winner, created: false };
    }
  }

  /**
   * Fill in better information on an existing client. Every change is one atomic update guarded by the current value,
   * so two requests racing can only ever make the client "better", never overwrite the admin's own entries.
   */
  async function improveClient(client, { name, nameSource, email, city } = {}) {
    const { models } = await getDeps();
    const { Client } = models;

    const cleanName = text(name, 100);
    if (cleanName && nameSource && cleanName !== client.name && lowerThan(nameSource).includes(client.nameSource ?? 'manual')) {
      await Client.updateOne({ _id: client._id, nameSource: { $in: lowerThan(nameSource) } }, { $set: { name: cleanName, nameSource } });
    }
    const cleanEmail = text(email, 254).toLowerCase();
    if (cleanEmail && isEmail(cleanEmail) && !client.email) {
      await Client.updateOne({ _id: client._id, email: { $in: ['', null] } }, { $set: { email: cleanEmail } });
    }
    const cleanCity = text(city, 80);
    if (cleanCity && !client.city) {
      await Client.updateOne({ _id: client._id, city: { $in: ['', null] } }, { $set: { city: cleanCity } });
    }
  }

  /** Attach an existing conversation (same number) that is not linked to anybody yet. Never steals one from another client. */
  async function adoptConversation(normalizedPhone, clientId) {
    const { models } = await getDeps();
    await models.WhatsAppConversation.updateOne({ phone: normalizedPhone, clientId: null }, { $set: { clientId } });
  }

  /**
   * A booking was just saved → { outcome: 'created' | 'linked' | 'unmatched', client? }
   * 'unmatched' = the booking's phone is too short or ambiguous to place (no country code and fewer than 10 digits):
   * the booking is left unlinked on purpose and shows up in the backfill report.
   */
  async function linkBookingToClient(booking) {
    const { models } = await getDeps();
    const parsed = normalizeClientPhone(booking.phone);
    if (!parsed) return { outcome: 'unmatched' };

    const { client, created } = await findOrCreateClient({
      normalizedPhone: parsed.phone, name: booking.name, nameSource: 'booking', email: booking.email, source: 'booking',
    });
    if (!created) await improveClient(client, { name: booking.name, nameSource: 'booking', email: booking.email });

    // only an unlinked booking is attached: a booking that already belongs to a client is never moved
    await models.Booking.updateOne({ _id: booking._id, clientId: null }, { $set: { clientId: client._id } });
    await adoptConversation(parsed.phone, client._id);
    return { outcome: created ? 'created' : 'linked', client };
  }

  /**
   * A customer's WhatsApp message was just stored → { outcome: 'created' | 'linked' | 'unmatched', client? }
   * `phone` is WhatsApp's number for the sender (digits with country code), `name` their WhatsApp profile name (may be empty).
   * No name → the client is named after the phone number (rank 'placeholder'), which any real name later replaces.
   */
  async function linkWhatsAppSender({ phone, name }) {
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    if (!normalizedPhone) return { outcome: 'unmatched' };
    const profileName = text(name, 100);

    const { client, created } = await findOrCreateClient({
      normalizedPhone, name: profileName, nameSource: 'whatsapp', source: 'whatsapp',
    });
    if (!created && profileName) await improveClient(client, { name: profileName, nameSource: 'whatsapp' });
    await adoptConversation(normalizedPhone, client._id);
    return { outcome: created ? 'created' : 'linked', client };
  }

  /**
   * The admin typed a client in. { values: parseClientInput().values, author: { _id, name } } → { client, created }
   * An existing number returns the EXISTING client untouched (created: false): nothing is overwritten and the note is not added.
   */
  async function createManualClient({ values, author }) {
    const { models } = await getDeps();
    const { client, created } = await findOrCreateClient({
      normalizedPhone: values.normalizedPhone, name: values.name, nameSource: 'manual', source: 'manual', email: values.email, city: values.city,
    });
    if (!created) return { client, created: false };

    if (values.notes) {
      await models.ClientNote.create({ clientId: client._id, body: values.notes, authorId: author?._id, authorName: text(author?.name, 80) });
    }
    await adoptConversation(values.normalizedPhone, client._id);
    return { client, created: true };
  }

  return { findOrCreateClient, improveClient, adoptConversation, linkBookingToClient, linkWhatsAppSender, createManualClient };
}

// ---------------------------------------------------------------------- never-throwing wrappers (used by the booking and webhook code)
/** The kind of problem only: no names, numbers or emails in logs. */
const kind = (err) => err?.name ?? 'Error';

/** isReady may be async: when it says false the CRM step is skipped (the booking / message itself is unaffected). */
export function createSafeLinks(service, { isReady = () => true, logger = console } = {}) {
  return {
    /** → { outcome: 'created' | 'linked' | 'unmatched' | 'skipped' | 'error' }. Never throws. */
    async linkBooking(booking) {
      try {
        if (!(await isReady())) return { outcome: 'skipped' };
        const { outcome } = await service.linkBookingToClient(booking);
        return { outcome };
      } catch (err) {
        logger.error(`[clients] a saved booking could not be linked to a client (${kind(err)}); run "npm run backfill:clients" to repair`);
        return { outcome: 'error' };
      }
    },
    /** `message` = one entry of parseWebhook().incoming ({ from, name, ... }). Never throws. */
    async linkWhatsApp(message) {
      try {
        if (!(await isReady())) return { outcome: 'skipped' };
        const { outcome } = await service.linkWhatsAppSender({ phone: message?.from, name: message?.name });
        return { outcome };
      } catch (err) {
        logger.error(`[clients] a WhatsApp sender could not be linked to a client (${kind(err)})`);
        return { outcome: 'error' };
      }
    },
  };
}

// ---------------------------------------------------------------------- the real thing (models load on first use)
let deps;
const realDeps = async () => {
  deps ??= { models: await import('../models/index.js') };
  return deps;
};

export const clients = createClients(realDeps);
export const { findOrCreateClient, improveClient, linkBookingToClient, linkWhatsAppSender, createManualClient } = clients;

/** Real linking is only attempted while the database connection is up (a CRM step must never sit waiting on a dead connection). */
const databaseReady = async () => {
  const { default: mongoose } = await import('mongoose');
  return mongoose.connection.readyState === 1;
};
const safe = createSafeLinks(clients, { isReady: databaseReady });
export const safeLinkBooking = safe.linkBooking;
export const safeLinkWhatsApp = safe.linkWhatsApp;
