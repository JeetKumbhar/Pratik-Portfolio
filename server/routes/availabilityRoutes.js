import { Router } from 'express';
import { getMonth, getDay, getAdminCalendar } from '../controllers/availabilityController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// ---------- PUBLIC: only "available / limited / unavailable", never the reason ----------
router.get('/', getMonth);

// ---------- ADMIN: the reason for every day (booked, editing, vacation ...) ----------
router.get('/admin/calendar', protect, adminOnly, getAdminCalendar);

router.get('/:date', getDay);

export default router;
