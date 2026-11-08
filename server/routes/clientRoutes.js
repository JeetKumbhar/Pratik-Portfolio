import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getClientStats, getClients, getClient, updateClient, getClientBookings, getClientWhatsApp,
  getClientNotes, addClientNote, updateClientNote, deleteClientNote,
} from '../controllers/clientController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// The Clients screens load several things per page and search as you type, so (like the WhatsApp inbox) they get their own
// roomier allowance and are skipped by the global limiter in server.js. It runs BEFORE the login check so guessing tokens stays limited too.
router.use(rateLimit({
  windowMs: 60 * 1000, limit: 240, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down for a moment.' },
}));

// ---------- ADMIN ONLY: there is no public route here. Client details and notes are private. ----------
router.use(protect, adminOnly);

router.get('/stats', getClientStats); // must stay above '/:id', or "stats" would be treated as an id
router.get('/', getClients);
router.get('/:id', getClient);
router.patch('/:id', updateClient);
router.get('/:id/bookings', getClientBookings);
router.get('/:id/whatsapp', getClientWhatsApp);
router.get('/:id/notes', getClientNotes);
router.post('/:id/notes', addClientNote);
router.patch('/:id/notes/:noteId', updateClientNote);
router.delete('/:id/notes/:noteId', deleteClientNote);

export default router;
