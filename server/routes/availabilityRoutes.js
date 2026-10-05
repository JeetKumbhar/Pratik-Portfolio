import { Router } from 'express';
import { getMonth, getDay } from '../controllers/availabilityController.js';

const router = Router();

router.get('/', getMonth);
router.get('/:date', getDay);

export default router;
