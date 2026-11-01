import express, { Router } from 'express';
import { verifyHandshake, receiveEvents } from '../controllers/whatsappWebhookController.js';

const router = Router();

// Meta calls these two URLs, so there is no login here. The security is the secret handshake token (GET) and the
// signature on every POST. The body is kept RAW because the signature is calculated over the exact bytes received.
router.get('/', verifyHandshake);
router.post('/', express.raw({ type: 'application/json', limit: '256kb' }), receiveEvents);

export default router;
