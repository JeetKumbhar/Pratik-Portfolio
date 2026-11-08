import { nationalKey, normalizeClientPhone, normalizeWhatsAppPhone } from './phone.js';
import { shouldHaveClient } from './clients.js';

/**
 * The thinking part of `npm run backfill:clients` (the script does the database reading and writing). Pure: no database.
 *
 * A client now exists only because of a CONFIRMED booking. Bookings that were confirmed before this rule (or whose link failed)
 * may have no client yet. planBackfill() looks at the confirmed / completed bookings that have no client, groups them by the
 * normalized phone number, which tells the script which clients to create and which records to attach, and it REPORTS everything
 * that deserves a human look. Pending and cancelled bookings are left alone, and a WhatsApp conversation is only attached to a
 * client that exists (or is about to be created for a confirmed booking): a conversation alone never creates a client.
 *
 *   unlinkable          bookings whose phone cannot be placed (no country code and fewer than 10 digits). They stay unlinked.
 *   formatVariants      the same number written differently ("+91 98765 43210" / "09876543210"). They WILL share one client (it is the same number).
 *   sharedPhoneNames    one number used with different names (a family phone?). They share one client too, because the rule is
 *                       one client per number, but you may want to rename it.
 *   possibleDuplicates  DIFFERENT numbers with the same last 10 digits (probably the same person with another country code).
 *                       Never merged automatically: each stays its own client until you decide.
 *   clientsWithoutConfirmedBooking  clients that exist but have no confirmed booking (made by the earlier version of the Clients
 *                       section from a pending booking or a WhatsApp message, or typed in by hand). They are KEPT: nothing is deleted or merged.
 */
const time = (d) => (d ? +new Date(d) : 0);
const lower = (s) => String(s ?? '').trim().toLowerCase();

/** { bookings, conversations, clients } (lean documents) → { groups, unlinkable, report } */
export function planBackfill({ bookings = [], conversations = [], clients = [] }) {
  const clientByPhone = new Map(clients.map((c) => [c.normalizedPhone, c]));
  const groups = new Map(); // normalized phone → { phone, bookings:[], conversations:[], rawPhones:Set, assumedCountry }
  const unlinkable = [];
  const touch = (phone) => {
    if (!groups.has(phone)) groups.set(phone, { phone, bookings: [], conversations: [], rawPhones: new Set(), assumedCountry: false });
    return groups.get(phone);
  };

  let bookingsLinked = 0;
  let bookingsNotConfirmed = 0;
  const clientsWithConfirmed = new Set(); // ids of clients that already have a confirmed / completed booking
  for (const b of bookings) {
    const confirmed = shouldHaveClient(b); // confirmed / completed now, or confirmed at some point (confirmedAt)
    if (b.clientId) { bookingsLinked += 1; if (confirmed) clientsWithConfirmed.add(String(b.clientId)); continue; }
    if (!confirmed) { bookingsNotConfirmed += 1; continue; } // pending / cancelled: no client for it
    const parsed = normalizeClientPhone(b.phone);
    if (!parsed) { unlinkable.push({ bookingId: b.bookingId, reason: 'phone number has no country code and is too short to place' }); continue; }
    const g = touch(parsed.phone);
    g.bookings.push(b);
    g.rawPhones.add(String(b.phone).trim());
    g.assumedCountry ||= parsed.assumedCountry;
  }

  let conversationsLinked = 0;
  let conversationsWithoutClient = 0;
  for (const c of conversations) {
    if (c.clientId) { conversationsLinked += 1; continue; }
    const phone = normalizeWhatsAppPhone(c.phone);
    if (!phone) continue; // the conversation model already guarantees a valid number; skip anything else rather than guess
    if (groups.has(phone) || clientByPhone.has(phone)) touch(phone).conversations.push(c);
    else conversationsWithoutClient += 1; // no client and no confirmed booking for this number: it stays a plain inbox conversation
  }

  const planned = [...groups.values()].map((g) => ({ ...g, rawPhones: [...g.rawPhones], existingClientId: clientByPhone.get(g.phone)?._id ?? null }));

  const clientsWithoutConfirmedBooking = clients.filter((c) => !clientsWithConfirmed.has(String(c._id)) && !groups.has(c.normalizedPhone)).length;
  const formatVariants = planned.filter((g) => g.rawPhones.length > 1).map((g) => ({ phone: g.phone, variants: g.rawPhones }));
  const sharedPhoneNames = planned
    .map((g) => {
      const names = new Map(); // one entry per distinct name, ignoring capitals
      g.bookings.forEach((b) => { const n = String(b.name ?? '').trim(); if (n) names.set(lower(n), n); });
      return { phone: g.phone, names: [...names.values()] };
    })
    .filter((g) => g.names.length > 1);

  const byTail = new Map();
  const everyPhone = new Set([...clients.map((c) => c.normalizedPhone), ...planned.map((g) => g.phone)]);
  for (const phone of everyPhone) {
    const key = nationalKey(phone);
    byTail.set(key, [...(byTail.get(key) ?? []), phone]);
  }
  const possibleDuplicates = [...byTail.entries()].filter(([, phones]) => phones.length > 1).map(([key, phones]) => ({ nationalKey: key, phones }));

  return {
    groups: planned,
    unlinkable,
    report: {
      bookingsTotal: bookings.length,
      bookingsAlreadyLinked: bookingsLinked,
      bookingsToLink: planned.reduce((n, g) => n + g.bookings.length, 0),
      bookingsNotConfirmed,
      conversationsTotal: conversations.length,
      conversationsAlreadyLinked: conversationsLinked,
      conversationsToLink: planned.reduce((n, g) => n + g.conversations.length, 0),
      conversationsWithoutClient,
      clientsToCreate: planned.filter((g) => !g.existingClientId).length,
      clientsExisting: clients.length,
      clientsWithoutConfirmedBooking,
      unlinkable,
      formatVariants,
      sharedPhoneNames,
      possibleDuplicates,
    },
  };
}

/**
 * What to use when creating the client for one group (only groups with a confirmed booking exist). The client's "since" date is the
 * OLDEST booking's date (so importing old data never makes everyone look like a new client this month); the name and email come
 * from the NEWEST booking.
 */
export function clientFromGroup(group) {
  const newestFirst = [...group.bookings].sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const oldest = group.bookings.map((b) => time(b.createdAt)).filter(Boolean).sort((a, b) => a - b)[0];
  const conversationName = group.conversations.map((c) => c.name).find(Boolean);
  const bookingName = newestFirst.map((b) => b.name).find(Boolean);

  return {
    normalizedPhone: group.phone,
    name: bookingName || conversationName || '',
    nameSource: bookingName ? 'booking' : 'whatsapp',
    email: newestFirst.map((b) => b.email).find(Boolean) ?? '',
    source: 'booking',
    createdAt: oldest ? new Date(oldest) : undefined,
  };
}
