import { Request, Response } from 'express';
import * as svc from '../services/paymentInstrumentService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function createVoucher(req: Request, res: Response) {
  try {
    const saved = await svc.createVoucher(req.body || {});
    void logAppAdminAction(req, 'insert', 'restaurant_voucher', (saved as any).id, {
      code: (saved as any).code,
    });
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Voucher error' });
  }
}

export async function getVoucherByCode(req: Request, res: Response) {
  try {
    const row = await svc.getVoucherByCode(String(req.params.code || ''));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Voucher error' });
  }
}

export async function listVouchers(_req: Request, res: Response) {
  try {
    const rows = await svc.listVouchers();
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Voucher error' });
  }
}

export async function createCard(req: Request, res: Response) {
  try {
    const saved = await svc.createCard(req.body || {});
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Card error' });
  }
}

export async function getCardByCode(req: Request, res: Response) {
  try {
    const row = await svc.getCardByCode(String(req.params.code || ''));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Card error' });
  }
}

export async function listCards(_req: Request, res: Response) {
  try {
    const rows = await svc.listCards();
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Card error' });
  }
}

export async function topupCardByCode(req: Request, res: Response) {
  try {
    const code = String(req.params.code || '');
    const saved = await svc.topupCardByCode(code, req.body || {});
    void logAppAdminAction(req, 'confirm', 'restaurant_card_topup', code, {
      amount: (req.body || {}).amount,
    });
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Card topup error' });
  }
}

export async function listCardMovementsByCode(req: Request, res: Response) {
  try {
    const rows = await svc.listCardMovementsByCode(String(req.params.code || ''));
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Card movement error' });
  }
}

export async function testExternalRestaurantCardApi(req: Request, res: Response) {
  try {
    const result = await svc.testExternalRestaurantCardApi(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'External API test error' });
  }
}
