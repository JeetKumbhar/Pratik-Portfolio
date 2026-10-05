import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createBooking, getBookings, getBooking, updateBooking, deleteBooking } from '../controllers/bookingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();
const isProd = process.env.NODE_ENV === 'production';

// Public endpoint → strict limit per IP (looser in development so testing doesn't lock you out)
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isProd ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many booking requests from this device. Please try again later.' },
});

// Public
router.post('/', createLimiter, createBooking);

// Admin only (everything below needs a valid token AND role "admin")
router.use(protect, adminOnly);
router.get('/', getBookings);
router.route('/:id').get(getBooking).patch(updateBooking).delete(deleteBooking);

export default router;
