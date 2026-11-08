import { Client, ClientNote } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { CLIENT_BOOKING_FILTERS, CLIENT_FILTERS, CLIENT_SORTS } from '../config/constants.js';
import { parseClientInput, parseNoteInput } from '../utils/clientInput.js';
import { findConversation, getStats, getSummary, listBookings, listClients, publicClient } from '../utils/clientQueries.js';

/**
 * Admin → Clients. Every route here sits behind protect + adminOnly (see routes/clientRoutes.js).
 * Notes are private: they are only ever returned by the /notes routes below and never by a client, booking or WhatsApp response.
 * Response shape, like the rest of the API: { success: true, data, ...extras } or { success: false, message, errors? }.
 */
const ID_RE = /^[a-f\d]{24}$/i;
const NOTES_LIMIT = 500;

// ---------------------------------------------------------------- helpers
const queryText = (req, name) => {
  const v = req.query[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw httpError(400, `Invalid ${name}`);
  return v.trim();
};

const oneOf = (value, allowed, name, fallback) => {
  if (value === undefined || value === '') return fallback;
  if (!allowed.includes(value)) throw httpError(400, `${name} must be one of: ${allowed.join(', ')}`);
  return value;
};

/** Not a valid id, or no such client: both are simply "not found" (a deleted or mistyped link must not crash the page). */
async function loadClient(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw httpError(404, 'Client not found');
  const client = await Client.findById(id);
  if (!client) throw httpError(404, 'Client not found');
  return client;
}

async function loadNote(client, noteId) {
  if (typeof noteId !== 'string' || !ID_RE.test(noteId)) throw httpError(404, 'Note not found');
  const note = await ClientNote.findOne({ _id: noteId, clientId: client._id }); // a note is only reachable through ITS OWN client
  if (!note) throw httpError(404, 'Note not found');
  return note;
}

const duplicateResponse = async (res, normalizedPhone, exceptId) => {
  const other = await Client.findOne({ normalizedPhone, ...(exceptId && { _id: { $ne: exceptId } }) }).select('name');
  const message = 'Another client already uses this phone number.';
  return res.status(409).json({ success: false, message, errors: { phone: message }, ...(other && { existing: { id: String(other._id), name: other.name } }) });
};

// ---------------------------------------------------------------- GET /api/clients/stats
export const getClientStats = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getStats() });
});

// ---------------------------------------------------------------- GET /api/clients
// ?search= &filter=all|new|repeat|upcoming|none &sort=recent|oldest|lastBooking|mostBookings &page= &limit=
export const getClients = asyncHandler(async (req, res) => {
  const search = queryText(req, 'search') ?? '';
  if (search.length > 50) throw httpError(400, 'Search is too long');
  const filter = oneOf(queryText(req, 'filter'), CLIENT_FILTERS, 'filter', 'all');
  const sort = oneOf(queryText(req, 'sort'), CLIENT_SORTS, 'sort', 'recent');

  const page = queryText(req, 'page') === undefined ? 1 : Number(queryText(req, 'page'));
  const limit = queryText(req, 'limit') === undefined ? 20 : Number(queryText(req, 'limit'));
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw httpError(400, 'page must be a whole number from 1 to 100000');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw httpError(400, 'limit must be 1 to 100');

  const { rows, total } = await listClients({ search, filter, sort, page, limit });
  res.json({ success: true, total, page, pages: Math.max(1, Math.ceil(total / limit)), count: rows.length, data: rows });
});

// There is deliberately NO "create client" route: a client appears automatically when a booking is confirmed
// (see utils/clients.js → linkBookingToClient, called from controllers/bookingController.js → updateBooking).

// ---------------------------------------------------------------- GET /api/clients/:id
// the client + their booking numbers (total, upcoming, completed, cancelled, last booking, New / Repeat)
export const getClient = asyncHandler(async (req, res) => {
  const client = await loadClient(req.params.id);
  const summary = await getSummary(client._id);
  res.json({ success: true, data: { ...publicClient(client), summary } });
});

// ---------------------------------------------------------------- PATCH /api/clients/:id
// body: any of { name, phone, email, city }. Editing the name by hand makes it "manual": automatic sources never overwrite it again.
export const updateClient = asyncHandler(async (req, res) => {
  const client = await loadClient(req.params.id);
  const { values } = parseClientInput(req.body, { partial: true });
  const changes = ['name', 'phone', 'email', 'city'].filter((k) => k in values);
  if (changes.length === 0) throw httpError(400, 'Nothing to update. Editable fields: name, phone, email, city.');

  if (values.name !== undefined && values.name !== client.name) {
    client.name = values.name;
    client.nameSource = 'manual';
  }
  if (values.normalizedPhone !== undefined && values.normalizedPhone !== client.normalizedPhone) {
    const taken = await Client.exists({ normalizedPhone: values.normalizedPhone, _id: { $ne: client._id } });
    if (taken) return duplicateResponse(res, values.normalizedPhone, client._id);
    client.normalizedPhone = values.normalizedPhone;
    client.phone = values.phone;
    // A client still named after their OLD number (no real name known) is renamed after the new one; a real name is never touched
    if (client.nameSource === 'placeholder' && (values.name === undefined || values.name === client.name)) client.name = values.phone;
  }
  if (values.email !== undefined) client.email = values.email;
  if (values.city !== undefined) client.city = values.city;

  try {
    await client.save();
  } catch (err) {
    if (err?.code === 11000) return duplicateResponse(res, client.normalizedPhone, client._id); // two edits raced: the unique index decided
    throw err;
  }
  return res.json({ success: true, data: publicClient(client) });
});

// ---------------------------------------------------------------- GET /api/clients/:id/bookings?filter=all|upcoming|completed|cancelled
export const getClientBookings = asyncHandler(async (req, res) => {
  const client = await loadClient(req.params.id);
  const filter = oneOf(queryText(req, 'filter'), CLIENT_BOOKING_FILTERS, 'filter', 'all');
  const [data, summary] = await Promise.all([listBookings(client._id, filter), getSummary(client._id)]);
  res.json({
    success: true,
    counts: {
      all: summary.totalBookings, upcoming: summary.upcomingBookings, completed: summary.completedBookings, cancelled: summary.cancelledBookings,
    },
    count: data.length,
    data,
  });
});

// ---------------------------------------------------------------- GET /api/clients/:id/whatsapp
// { available, conversation: { id, lastMessagePreview, lastMessageAt, lastMessageDirection, unreadCount, status } | null }
// Only a summary: the chat itself stays in Admin → Messages → WhatsApp. No tokens or credentials are involved.
export const getClientWhatsApp = asyncHandler(async (req, res) => {
  const client = await loadClient(req.params.id);
  const conversation = await findConversation(client);
  res.json({ success: true, data: { available: Boolean(conversation), conversation } });
});

// ---------------------------------------------------------------- notes
export const getClientNotes = asyncHandler(async (req, res) => {
  const client = await loadClient(req.params.id);
  const notes = await ClientNote.find({ clientId: client._id }).sort({ createdAt: -1, _id: -1 }).limit(NOTES_LIMIT);
  res.json({ success: true, count: notes.length, data: notes });
});

export const addClientNote = asyncHandler(async (req, res) => {
  const client = await loadClient(req.params.id);
  const body = parseNoteInput(req.body);
  const note = await ClientNote.create({ clientId: client._id, body, authorId: req.user._id, authorName: req.user.name });
  res.status(201).json({ success: true, data: note });
});

export const updateClientNote = asyncHandler(async (req, res) => {
  const client = await loadClient(req.params.id);
  const note = await loadNote(client, req.params.noteId);
  const body = parseNoteInput(req.body);
  if (body !== note.body) {
    note.body = body;
    note.editedAt = new Date();
    await note.save();
  }
  res.json({ success: true, data: note });
});

export const deleteClientNote = asyncHandler(async (req, res) => {
  const client = await loadClient(req.params.id);
  const note = await loadNote(client, req.params.noteId);
  await note.deleteOne();
  res.json({ success: true, message: 'Note deleted' });
});
