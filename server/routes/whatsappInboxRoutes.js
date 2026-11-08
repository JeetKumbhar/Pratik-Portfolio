import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getConversations, getConversationMessages, getUnread, readConversation, replyToConversation } from '../controllers/whatsappInboxController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// The admin screen refreshes every few seconds, so these routes have their own, roomier allowance (and are skipped by the
// global limiter in server.js). Replies get a tighter one. (Skipped only when NODE_ENV is 'test', so the stress tests are not throttled.) Both run BEFORE the login check so guessing tokens stays limited too.
const limit = (max, windowMs = 60 * 1000) => rateLimit({ windowMs, limit: max, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test', message: { success: false, message: 'Too many requests. Please slow down for a moment.' } });
router.use(limit(240));
router.use(protect, adminOnly);

router.get('/unread-count', getUnread);
router.get('/conversations', getConversations);
router.get('/conversations/:id/messages', getConversationMessages);
router.post('/conversations/:id/read', readConversation);
router.post('/conversations/:id/reply', limit(30), replyToConversation);

export default router;
