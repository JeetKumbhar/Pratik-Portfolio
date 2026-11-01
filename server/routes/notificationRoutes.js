import { Router } from 'express';
import { getNotifications, retry } from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// Admin only (valid JWT + admin role)
router.use(protect, adminOnly);
router.get('/', getNotifications);
router.post('/:id/retry', retry);

export default router;
