import { Router } from 'express';
import { createBlockedDates, deleteBlockedDate, listBlockedDates } from '../controllers/blockedDateController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// Everything here changes what customers can book, so it is admin-only (valid JWT + admin role)
router.use(protect, adminOnly);
router.get('/', listBlockedDates);
router.post('/', createBlockedDates);
router.delete('/:id', deleteBlockedDate);

export default router;
