import { Router } from 'express';
import { getPackages } from '../controllers/packageController.js';

const router = Router();

router.get('/', getPackages);
// TODO (admin phase): router.post('/', protect, adminOnly, createPackage) …

export default router;
