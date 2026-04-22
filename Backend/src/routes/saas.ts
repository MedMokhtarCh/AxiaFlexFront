import { Router } from 'express';
import * as saasController from '../controllers/saasController.js';

const router = Router();

router.post('/verify', saasController.verifySuperAdmin);
router.get('/license', saasController.getLicense);
router.patch('/license', saasController.patchLicense);
router.post('/license/sync-external', saasController.syncLicenseExternal);
router.get('/terminals', saasController.listSaasTerminals);
router.patch('/terminals/:id', saasController.patchSaasTerminal);
router.get('/logs', saasController.getDeveloperLogs);
router.post('/logs', saasController.postDeveloperLog);
router.post('/maintenance/purge-transactions', saasController.purgeTransactions);
router.post('/maintenance/reset-minimal', saasController.resetToMinimal);

export default router;
