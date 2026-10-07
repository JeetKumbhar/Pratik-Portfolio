import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createBooking, getBookings, getBookingStats, getBooking, updateBooking, deleteBooking,
} from '../controllers/bookingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// ---------- PUBLIC ----------
// The only open write endpoint, so it is limited: 10 booking requests per hour per IP
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many booking requests from this connection. Please try again later.' },
});
router.post('/', createLimiter, createBooking);

// ---------- ADMIN ONLY (everything below needs a valid admin token) ----------
router.use(protect, adminOnly);
router.get('/', getBookings);
router.get('/stats', getBookingStats); // must stay above '/:id', or "stats" would be treated as an id
router.get('/:id', getBooking);
router.patch('/:id', updateBooking);
router.delete('/:id', deleteBooking);

export default router;
