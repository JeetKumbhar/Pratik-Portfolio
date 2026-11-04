import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { getThread, listConversations, markRead, sendReply, unreadTotal } from '../utils/whatsappReplies.js';

// Admin only (see the route). The real work lives in utils/whatsappReplies.js.
const query = (req, name) => {
  const v = req.query[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw httpError(400, `Invalid ${name}`);
  return v;
};

// GET /api/whatsapp/conversations?search=&unread=1&page=&limit=
export const getConversations = asyncHandler(async (req, res) => {
  const result = await listConversations({ page: query(req, 'page'), limit: query(req, 'limit'), search: query(req, 'search') ?? '', unreadOnly: query(req, 'unread') === '1' });
  res.json({ success: true, ...result });
});

// GET /api/whatsapp/unread-count   → the sidebar badge
export const getUnread = asyncHandler(async (req, res) => {
  res.json({ success: true, unread: await unreadTotal() });
});

// GET /api/whatsapp/conversations/:id/messages?limit=
export const getConversationMessages = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getThread(req.params.id, { limit: query(req, 'limit') })) });
});

// POST /api/whatsapp/conversations/:id/read
export const readConversation = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await markRead(req.params.id)) });
});

// POST /api/whatsapp/conversations/:id/reply   body: { text, clientRequestId }
// 201 = WhatsApp accepted it. 200 = it was a repeat of an earlier reply (nothing was sent again).
// 502 = WhatsApp refused it: the saved message is returned too, with errorText saying why.
export const replyToConversation = asyncHandler(async (req, res) => {
  const { text, clientRequestId } = req.body ?? {};
  const { message, failed, duplicate } = await sendReply(req.params.id, { text, clientRequestId });
  if (failed && !duplicate) return res.status(502).json({ success: false, message: message.errorText || 'WhatsApp could not send the reply.', data: message });
  res.status(duplicate ? 200 : 201).json({ success: true, duplicate, data: message });
});
