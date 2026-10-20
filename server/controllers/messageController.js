import { Message } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { MESSAGE_STATUSES } from '../config/constants.js';
import { sendMessageReceived } from '../utils/messageEmails.js';

const str = (v) => (typeof v === 'string' ? v : undefined);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function findMessage(id) {
  const message = /^[a-f\d]{24}$/i.test(id) ? await Message.findById(id) : null;
  if (!message) throw httpError(404, 'Message not found');
  return message;
}

// ---------------------------------------------------------------- POST /api/messages  (PUBLIC, rate limited in the route)
// body: { name, email, phone?, subject?, message }      status is always "new": the public can never set it
export const createMessage = asyncHandler(async (req, res) => {
  const b = req.body ?? {};

  // Honeypot: the contact form has a hidden "website" box that people never see and bots love to fill in.
  // Pretend it worked, store nothing.
  if (typeof b.website === 'string' && b.website.trim()) {
    return res.status(201).json({ success: true, message: 'Message sent.' });
  }

  const message = await Message.create({
    name: str(b.name),
    email: str(b.email),
    phone: str(b.phone),
    subject: str(b.subject),
    message: str(b.message),
  });

  sendMessageReceived(message); // fire and forget

  // Nothing from the message is sent back
  res.status(201).json({ success: true, message: "Thanks! I'll get back to you within 24 hours." });
});

// ---------------------------------------------------------------- everything below: ADMIN only
// GET /api/messages?filter=unread|read &search= &page= &limit=   newest first
export const getMessages = asyncHandler(async (req, res) => {
  const q = (name) => {
    const v = req.query[name];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') throw httpError(400, `Invalid ${name}`);
    return v.trim();
  };

  const filter = {};
  const which = q('filter');
  if (which) {
    if (which === 'unread') filter.status = 'new';
    else if (which === 'read') filter.status = { $ne: 'new' };
    else throw httpError(400, 'filter must be "unread" or "read".');
  }

  const search = q('search');
  if (search) {
    if (search.length > 50) throw httpError(400, 'Search is too long');
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { message: rx }];
  }

  const page = q('page') === undefined ? 1 : Number(q('page'));
  const limit = q('limit') === undefined ? 20 : Number(q('limit'));
  if (!Number.isInteger(page) || page < 1) throw httpError(400, 'page must be 1 or more');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw httpError(400, 'limit must be 1 to 100');

  const [total, messages, all, unread] = await Promise.all([
    Message.countDocuments(filter),
    Message.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Message.countDocuments(),
    Message.countDocuments({ status: 'new' }),
  ]);

  res.json({
    success: true, total, page, pages: Math.max(1, Math.ceil(total / limit)), count: messages.length,
    counts: { all, unread, read: all - unread }, // for the tabs
    data: messages,
  });
});

// GET /api/messages/unread-count → { unread }   (the badge in the sidebar)
export const getUnreadCount = asyncHandler(async (req, res) => {
  res.json({ success: true, unread: await Message.countDocuments({ status: 'new' }) });
});

// POST /api/messages/mark-all-read
export const markAllRead = asyncHandler(async (req, res) => {
  const result = await Message.updateMany({ status: 'new' }, { $set: { status: 'read' } });
  res.json({ success: true, updated: result.modifiedCount });
});

// PATCH /api/messages/:id   { status: 'read' | 'new' | 'replied' | 'archived' }   (a message's text can never be edited)
export const updateMessage = asyncHandler(async (req, res) => {
  const status = req.body?.status;
  if (status === undefined) throw httpError(400, 'Nothing to update. You can change: status.');
  if (typeof status !== 'string' || !MESSAGE_STATUSES.includes(status)) throw httpError(400, `status must be one of: ${MESSAGE_STATUSES.join(', ')}`);

  const message = await findMessage(req.params.id);
  message.status = status;
  await message.save();
  res.json({ success: true, data: message });
});

// DELETE /api/messages/:id   (permanent)
export const deleteMessage = asyncHandler(async (req, res) => {
  const message = await findMessage(req.params.id);
  await message.deleteOne();
  res.json({ success: true, message: 'Message deleted.' });
});
