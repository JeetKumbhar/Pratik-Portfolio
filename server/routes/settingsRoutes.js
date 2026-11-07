import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getPublicSettings, getAllSettings, getSettingsGroup, updateSettingsGroup, getBrandingUploadSignature,
  getWhatsAppStatus, sendWhatsAppTest, getAccount, changeEmail, changePassword, logoutEverywhere,
} from '../controllers/settingsController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// ---------- PUBLIC: only the fields the website needs ----------
router.get('/public', getPublicSettings);

// ---------- ADMIN ONLY (valid JWT + admin role). Private settings are never reachable without it. ----------
router.use(protect, adminOnly);

// Password checks are guesses at the admin's password: limit them like the login
const securityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});
// A real WhatsApp message is sent: keep accidental repeats down
const testLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 3, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Test messages are limited to 3 every 10 minutes.' },
});

router.get('/', getAllSettings);
router.get('/upload-signature', getBrandingUploadSignature);
router.get('/whatsapp/status', getWhatsAppStatus);
router.post('/whatsapp/test', testLimiter, sendWhatsAppTest);
router.get('/account', getAccount);
router.patch('/account/email', securityLimiter, changeEmail);
router.patch('/account/password', securityLimiter, changePassword);
router.post('/account/logout-all', securityLimiter, logoutEverywhere);

// the groups come last so "account" or "whatsapp" is never mistaken for one
router.get('/:group', getSettingsGroup);
router.patch('/:group', updateSettingsGroup);

export default router;
