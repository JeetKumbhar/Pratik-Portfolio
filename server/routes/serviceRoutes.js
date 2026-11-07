import { Router } from 'express';
import { getPublicServices, getAdminServices, createService, updateService, reorderServices, deleteService } from '../controllers/serviceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = Router();

// ---------- PUBLIC: active services only ----------
router.get('/', getPublicServices);

// ---------- ADMIN ONLY ----------
router.use(protect, adminOnly);
router.get('/admin', getAdminServices);
router.post('/', createService);
router.put('/order', reorderServices); // must stay above '/:id'
router.patch('/:id', updateService);
router.delete('/:id', deleteService);

export default router;
