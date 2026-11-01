import { Notification } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { NOTIFICATION_EVENTS, NOTIFICATION_STATUSES } from '../config/constants.js';
import { configStatus } from '../services/whatsappService.js';
import { retryNotification } from '../utils/notificationHelper.js';

// GET /api/notifications?status= &event= &page= &limit=   (ADMIN)  newest first, with tab counts and the setup status
export const getNotifications = asyncHandler(async (req, res) => {
  const q = (name) => {
    const v = req.query[name];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') throw httpError(400, `Invalid ${name}`);
    return v.trim();
  };

  const filter = {};
  const status = q('status');
  if (status) {
    if (!NOTIFICATION_STATUSES.includes(status)) throw httpError(400, `status must be one of: ${NOTIFICATION_STATUSES.join(', ')}`);
    filter.status = status;
  }
  const event = q('event');
  if (event) {
    if (!NOTIFICATION_EVENTS.includes(event)) throw httpError(400, 'Unknown event');
    filter.event = event;
  }

  const page = q('page') === undefined ? 1 : Number(q('page'));
  const limit = q('limit') === undefined ? 20 : Number(q('limit'));
  if (!Number.isInteger(page) || page < 1) throw httpError(400, 'page must be 1 or more');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw httpError(400, 'limit must be 1 to 100');

  const [total, rows, grouped] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Notification.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const counts = Object.fromEntries(NOTIFICATION_STATUSES.map((s) => [s, 0]));
  grouped.forEach((g) => { counts[g._id] = g.count; });
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);

  res.json({ success: true, total, page, pages: Math.max(1, Math.ceil(total / limit)), count: rows.length, counts, config: configStatus(), data: rows });
});

// POST /api/notifications/:id/retry   (ADMIN)  tries a failed notification again
export const retry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^[a-f\d]{24}$/i.test(id)) throw httpError(404, 'Notification not found');

  const result = await retryNotification(id);
  if (result.outcome === 'not_found') throw httpError(404, 'Notification not found');
  if (result.outcome === 'not_configured') throw httpError(503, 'WhatsApp is not configured on the server.');
  if (result.outcome === 'not_retryable') throw httpError(409, 'Only failed notifications can be retried.');

  const log = result.log;
  const message = log.status === 'sent' ? 'Sent to WhatsApp.' : log.status === 'skipped' ? log.lastError : `It failed again: ${log.lastError}`;
  res.json({ success: true, message, data: log });
});
