import { CLIENT_NAME_SOURCES } from '../config/constants.js';
import { isEmail } from './validators.js';
import { formatPhoneDisplay, normalizeClientPhone, normalizeWhatsAppPhone } from './phone.js';

/**
 * Keeps the Clients (CRM) collection in step with CONFIRMED bookings. One client per phone number, forever.
 *
 *   linkBookingToClient(booking)     a booking was CONFIRMED (or is already confirmed/completed) → find or create the client, attach the booking
 *   linkWhatsAppSender({phone})      a WhatsApp message was stored → attach the conversation to the client with that number, IF one exists
 *
 * WHEN A CLIENT IS CREATED
 *   Only when the photographer sets a booking to "confirmed" (controllers/bookingController.js → updateBooking). A pending or
 *   cancelled booking never creates a client, a WhatsApp message never creates a client, and there is no manual "add client".
 *   Cancelling or completing a booking later never removes the client or the booking's link to it (the history stays).
 *
 * HOW DUPLICATES ARE PREVENTED
 *   The UNIQUE index on Client.normalizedPhone is the real guarantee. findOrCreateClient() looks first, then inserts;
 *   if two confirmations race and the loser's insert is refused (error 11000), it simply loads the winner's client.
 *   The booking is attached with ONE guarded update ({ clientId: null } → client), so confirming the same booking twice,
 *   or two requests confirming it at once, links it exactly once. Booking counts are never stored on the client: they are
 *   calculated from the linked bookings (utils/clientQueries.js), so they cannot be counted twice.
 *   No transactions are used (the project avoids them): every step is a single-document operation that is safe to repeat.
 *
 * HOW A CLIENT'S NAME IS PROTECTED
 *   Names have a rank: placeholder (the phone number) < whatsapp (profile name) < booking (typed on the form) < manual (admin).
 *   improveClient() only replaces a name with one of HIGHER rank, as one atomic update that checks the current rank,
 *   so a later booking can never overwrite a name the admin typed.
 *   Email and city are only ever filled in when empty; a different email on a later booking never replaces the client's own.
 *
 * FAILURE RULES (the confirmation itself always comes first)
 *   linkBooking() (the safe wrapper at the bottom) never throws. It retries a failed step a couple of times; if it still
 *   fails it answers { outcome: 'error' }, the booking stays confirmed, the admin is TOLD in the response of the status change,
 *   and the link is made the next time that booking is saved, or by `npm run backfill:clients`.
 *   Logs only the kind of error, never a name, number or email.
 *
 * Dependencies come in through getDeps() ({ models }) so all of this can be tested without a database.
 */
/** A booking in one of these statuses has been confirmed by the photographer (completed = confirmed, then the shoot happened). */
export const CLIENT_LINK_STATUSES = ['confirmed', 'completed'];

/** Does this booking deserve a client? Yes when it is confirmed/completed now, or WAS confirmed at some point (`confirmedAt`), e.g. confirmed, then cancelled. */
export const shouldHaveClient = (booking) => CLIENT_LINK_STATUSES.includes(booking?.status) || Boolean(booking?.confirmedAt);
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
   * A booking was just confirmed → { outcome: 'created' | 'linked' | 'already_linked' | 'not_confirmed' | 'unmatched', client? }
   *   created         no client had this phone number: one was created and the booking attached
   *   linked          a client with this phone number already existed (whatever email the booking used): the booking was attached to it
   *   already_linked  the booking already belonged to a client: nothing is changed (this is what makes confirming twice harmless)
   *   not_confirmed   pending / cancelled: a client is never created for it
   *   unmatched       the booking's phone is too short or ambiguous to place (no country code and fewer than 10 digits): left unlinked
   */
  async function linkBookingToClient(booking) {
    const { models } = await getDeps();
    if (!shouldHaveClient(booking)) return { outcome: 'not_confirmed' };
    if (booking.clientId) return { outcome: 'already_linked' };

    const parsed = normalizeClientPhone(booking.phone);
    if (!parsed) return { outcome: 'unmatched' };

    // The copy of the booking we were given may be stale (another request may have linked it a moment ago): look at the database before
    // creating anything, so a booking that already has a client never causes an extra client.
    const current = await models.Booking.findOne({ _id: booking._id }).select('clientId').lean();
    if (!current || current.clientId) return { outcome: 'already_linked' };

    const { client, created } = await findOrCreateClient({
      normalizedPhone: parsed.phone, name: booking.name, nameSource: 'booking', email: booking.email, source: 'booking',
    });
    if (!created) await improveClient(client, { name: booking.name, nameSource: 'booking', email: booking.email });

    // only an unlinked booking is attached: a booking that already belongs to a client is never moved
    const attached = await models.Booking.updateOne({ _id: booking._id, clientId: null }, { $set: { clientId: client._id } });
    if ((attached?.matchedCount ?? 1) === 0) return { outcome: 'already_linked' }; // someone linked it in the meantime: leave that link alone
    await adoptConversation(parsed.phone, client._id);
    return { outcome: created ? 'created' : 'linked', client };
  }

  /**
   * After the admin changed the phone number of a booking that already has a client: does the number still belong to that client?
   * → true | false. The booking is NEVER moved to another client automatically (that is the admin's decision); the admin is only told.
   */
  async function phoneMatchesLinkedClient(booking) {
    const { models } = await getDeps();
    if (!booking.clientId) return true;
    const parsed = normalizeClientPhone(booking.phone);
    if (!parsed) return true; // an empty or unplaceable number is reported separately
    const client = await models.Client.findOne({ _id: booking.clientId }).select('normalizedPhone').lean();
    return !client || client.normalizedPhone === parsed.phone;
  }

  /**
   * A customer's WhatsApp message was just stored → { outcome: 'linked' | 'no_client' | 'unmatched' }
   * `phone` is WhatsApp's number for the sender (digits with country code). A client is NEVER created here: only a confirmed booking
   * creates one. If a client with this number already exists the conversation is attached to it (so the profile shows the chat);
   * otherwise the conversation simply stays in the inbox and is attached later, when a booking for that number is confirmed.
   */
  async function linkWhatsAppSender({ phone }) {
    const { models } = await getDeps();
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    if (!normalizedPhone) return { outcome: 'unmatched' };

    const client = await models.Client.findOne({ normalizedPhone });
    if (!client) return { outcome: 'no_client' };
    await adoptConversation(normalizedPhone, client._id);
    return { outcome: 'linked', client };
  }

  return { findOrCreateClient, improveClient, adoptConversation, linkBookingToClient, linkWhatsAppSender, phoneMatchesLinkedClient };
}

// ---------------------------------------------------------------------- never-throwing wrappers (used by the booking and webhook code)
/** The kind of problem only: no names, numbers or emails in logs. */
const kind = (err) => err?.name ?? 'Error';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * isReady may be async: when it says false the CRM step is skipped (the booking / message itself is unaffected).
 * A failing step is tried again `retries` more times (a dropped connection or a lost race usually clears at once).
 */
export function createSafeLinks(service, { isReady = () => true, logger = console, retries = 2, delayMs = 200, sleep = wait } = {}) {
  return {
    /** → { outcome: 'created' | 'linked' | 'already_linked' | 'not_confirmed' | 'unmatched' | 'skipped' | 'error' }. Never throws. */
    async linkBooking(booking) {
      try {
        if (!(await isReady())) return { outcome: 'skipped' };
      } catch { return { outcome: 'skipped' }; }

      let lastKind = 'Error';
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const { outcome } = await service.linkBookingToClient(booking);
          return { outcome };
        } catch (err) {
          lastKind = kind(err);
          if (attempt < retries) await sleep(delayMs * (attempt + 1));
        }
      }
      logger.error(`[clients] a confirmed booking could not be linked to a client (${lastKind}); it will be retried when the booking is saved again, or run "npm run backfill:clients"`);
      return { outcome: 'error' };
    },
    /** `message` = one entry of parseWebhook().incoming ({ from, ... }). Never throws; never creates a client. */
    async linkWhatsApp(message) {
      try {
        if (!(await isReady())) return { outcome: 'skipped' };
        const { outcome } = await service.linkWhatsAppSender({ phone: message?.from });
        return { outcome };
      } catch (err) {
        logger.error(`[clients] a WhatsApp conversation could not be linked to a client (${kind(err)})`);
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
export const { findOrCreateClient, improveClient, linkBookingToClient, linkWhatsAppSender, phoneMatchesLinkedClient } = clients;

/** Real linking is only attempted while the database connection is up (a CRM step must never sit waiting on a dead connection). */
const databaseReady = async () => {
  const { default: mongoose } = await import('mongoose');
  return mongoose.connection.readyState === 1;
};
const safe = createSafeLinks(clients, { isReady: databaseReady });
export const safeLinkBooking = safe.linkBooking;
export const safeLinkWhatsApp = safe.linkWhatsApp;
