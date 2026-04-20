import { Request, Response } from 'express';
import * as fundService from '../services/fundService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function listFunds(req: Request, res: Response) {
  try {
    res.json(await fundService.listFunds());
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createFund(req: Request, res: Response) {
  try {
    const { name, currency, terminalId, isActive } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Missing name' });
    const saved = await fundService.createFund({ name, currency, terminalId, isActive });
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function patchFund(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const updated = await fundService.updateFund(id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'update', 'fund', id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteFund(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const ok = await fundService.deleteFund(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'delete', 'fund', id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
