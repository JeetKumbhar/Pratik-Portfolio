import { Router } from 'express';
import {
  getPublicPortfolio, getAdminPortfolio, getUploadSignature, createPhoto, updatePhoto, deletePhoto,
} from '../controllers/portfolioController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// ---------- PUBLIC ----------
router.get('/', getPublicPortfolio);

// ---------- ADMIN ONLY (valid JWT + admin role) ----------
router.use(protect, adminOnly);
router.get('/admin', getAdminPortfolio);
router.get('/upload-signature', getUploadSignature);
router.post('/', createPhoto);
router.patch('/:id', updatePhoto);
router.delete('/:id', deletePhoto);

export default router;
