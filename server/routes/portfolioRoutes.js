import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getPublicPortfolio, getAdminPortfolio, getUploadSignature, getUploadConfig, requestUpload, finalizeUpload, createPhoto, updatePhoto, deletePhoto,
} from '../controllers/portfolioController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// Preparing and finishing an upload: one photo per request, and a generous ceiling for a busy upload session (admin only anyway)
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many uploads in a short time. Please wait a few minutes and try again.' },
});

// ---------- PUBLIC ----------
router.get('/', getPublicPortfolio);

// ---------- ADMIN ONLY (valid JWT + admin role) ----------
router.use(protect, adminOnly);
router.get('/admin', getAdminPortfolio);
router.get('/upload-signature', getUploadSignature);
router.get('/upload-config', getUploadConfig);
router.post('/uploads', uploadLimiter, requestUpload);
router.post('/uploads/finalize', uploadLimiter, finalizeUpload);
router.post('/', createPhoto);
router.patch('/:id', updatePhoto);
router.delete('/:id', deletePhoto);

export default router;
