import { Router } from 'express';
import * as fiscalController from '../controllers/fiscalController.js';

const router = Router();

router.get('/manifest', fiscalController.getManifest);
router.get('/current-imdf', fiscalController.getCurrentImdf);
router.post('/checkout', fiscalController.checkout);
router.get('/transactions', fiscalController.listTransactions);
router.get('/transactions/:ticketId', fiscalController.getTransaction);
router.post('/transactions/:ticketId/retry-sync', fiscalController.retrySync);

export default router;
