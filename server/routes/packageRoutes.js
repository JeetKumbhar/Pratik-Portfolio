import { Router } from 'express';
import {
  getPackages, getAdminPackages, createPackage, updatePackage, deletePackage,
} from '../controllers/packageController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// ---------- PUBLIC: only ACTIVE packages (what the Services page and the booking form use) ----------
router.get('/', getPackages);

// ---------- ADMIN ONLY (valid JWT + admin role) ----------
router.use(protect, adminOnly);
router.get('/admin', getAdminPackages); // must stay above '/:id'
router.post('/', createPackage);
router.patch('/:id', updatePackage);
router.delete('/:id', deletePackage);

export default router;
