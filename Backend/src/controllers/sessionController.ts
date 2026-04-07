import { Request, Response } from 'express';
import * as sessionService from '../services/sessionService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function getSession(req: Request, res: Response) {
  try {
    const session = await sessionService.getSession();
    if (!session || !session.isOpen) return res.json({ isOpen: false });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function openSession(req: Request, res: Response) {
  try {
    const { initialFund } = req.body;
    const saved = await sessionService.openSession(initialFund);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function closeSession(req: Request, res: Response) {
  try {
    const { closingBalance, notes } = req.body || {};
    const saved = await sessionService.closeSession({ closingBalance, notes });
    if (!saved) return res.status(400).json({ error: 'No open fund session' });
    void logAppAdminAction(req, 'confirm', 'pos_session_close', saved.id, {
      closingBalance: (saved as any).closingBalance,
    });
    res.json(saved);
  } catch (err: any) {
    const msg = String(err?.message || 'Server error');
    const conflict =
      msg.includes('shifts serveur') || msg.includes('OPEN_SHIFTS') || msg.includes('cloturer la station');
    res.status(conflict ? 409 : 500).json({ error: msg });
  }
}

export async function addMovement(req: Request, res: Response) {
  try {
    const saved = await sessionService.addMovement(req.body);
    void logAppAdminAction(req, 'insert', 'pos_session_movement', (saved as any)?.id ?? null, {
      type: (req.body || {}).type,
    });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
