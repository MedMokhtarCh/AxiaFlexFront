import { Request, Response } from 'express';
import * as promotionService from '../services/promotionService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function listPromotions(req: Request, res: Response) {
  try { res.json(await promotionService.listPromotions()); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
}

export async function createPromotion(req: Request, res: Response) {
  try {
    const {
      name,
      type,
      active,
      startAt,
      endAt,
      productId,
      promoPrice,
      buyProductId,
      buyQty,
      freeProductId,
      freeQty,
    } = req.body ?? {};

    if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });

    const payload = {
      name: String(name),
      type: String(type),
      active: active !== undefined ? Boolean(active) : true,
      startAt: startAt ? Number(startAt) : null,
      endAt: endAt ? Number(endAt) : null,
      productId: productId || null,
      promoPrice: promoPrice !== undefined && promoPrice !== null ? Number(promoPrice) : null,
      buyProductId: buyProductId || null,
      buyQty: buyQty !== undefined && buyQty !== null ? Number(buyQty) : null,
      freeProductId: freeProductId || null,
      freeQty: freeQty !== undefined && freeQty !== null ? Number(freeQty) : null,
    };

    const saved = await promotionService.createPromotion(payload);
    void logAppAdminAction(req, 'insert', 'promotion', saved.id, { name: payload.name });
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function patchPromotion(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const updates = req.body ?? {};
    const updated = await promotionService.updatePromotion(id, updates);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deletePromotion(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const ok = await promotionService.deletePromotion(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'delete', 'promotion', id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
