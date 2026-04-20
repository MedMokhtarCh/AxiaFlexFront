import { Request, Response } from 'express';
import * as fiscalService from '../services/fiscalService.js';

export async function getManifest(_req: Request, res: Response) {
  try {
    const payload = await fiscalService.getManifest();
    res.json(payload);
  } catch (err: any) {
    res.status(503).json({ error: err?.message || 'SIC unavailable' });
  }
}

export async function getCurrentImdf(_req: Request, res: Response) {
  try {
    const payload = await fiscalService.getCurrentImdf();
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not resolve IMDF' });
  }
}

export async function checkout(req: Request, res: Response) {
  try {
    const payload = await fiscalService.checkout(req.body || {});
    res.json(payload);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Checkout failed' });
  }
}

export async function listTransactions(_req: Request, res: Response) {
  try {
    const rows = await fiscalService.listTransactions();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not list fiscal transactions' });
  }
}

export async function getTransaction(req: Request, res: Response) {
  try {
    const row = await fiscalService.getTransaction(String(req.params.ticketId || ''));
    if (!row) return res.status(404).json({ error: 'Fiscal transaction not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not read fiscal transaction' });
  }
}

export async function retrySync(req: Request, res: Response) {
  try {
    const row = await fiscalService.retrySync(String(req.params.ticketId || ''));
    if (!row) return res.status(404).json({ error: 'Fiscal transaction not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Retry sync failed' });
  }
}

export async function getOrderFiscalStatus(req: Request, res: Response) {
  try {
    const row = await fiscalService.getOrderFiscalStatus(String(req.params.id || ''));
    if (!row) return res.status(404).json({ error: 'No fiscal transaction found for this order' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not read order fiscal status' });
  }
}
