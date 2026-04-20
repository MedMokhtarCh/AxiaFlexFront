import { Request, Response } from 'express';
import * as paymentService from '../services/paymentService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function partialPayment(req: Request, res: Response) {
  try {
    const result = await paymentService.partialPayment(req.body);
    const oid = String((req.body || {}).orderId || '');
    void logAppAdminAction(req, 'confirm', 'partial_payment', oid || null, {
      amount: (req.body || {}).amount,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Payment error' });
  }
}

export async function getPaymentsByOrder(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const result = await paymentService.getPaymentsByOrder(orderId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Payment error' });
  }
}
