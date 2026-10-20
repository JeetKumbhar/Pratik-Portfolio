import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createMessage, getMessages, getUnreadCount, markAllRead, updateMessage, deleteMessage,
} from '../controllers/messageController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// ---------- PUBLIC: the contact form ----------
// 5 messages per hour per connection. Requests that fail validation do not use up the allowance.
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'You have sent several messages already. Please try again later, or email me directly.' },
});
router.post('/', createLimiter, createMessage);

// ---------- ADMIN ONLY (valid JWT + admin role) ----------
router.use(protect, adminOnly);
router.get('/', getMessages);
router.get('/unread-count', getUnreadCount); // these two must stay above '/:id'
router.post('/mark-all-read', markAllRead);
router.patch('/:id', updateMessage);
router.delete('/:id', deleteMessage);

export default router;
