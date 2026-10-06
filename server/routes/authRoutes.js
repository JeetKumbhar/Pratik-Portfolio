import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// 10 failed attempts per 15 minutes per IP (successful logins don't count)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

router.post('/login', loginLimiter, login);
router.get('/me', protect, adminOnly, getMe);

export default router;
