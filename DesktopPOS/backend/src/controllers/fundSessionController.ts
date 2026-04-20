import { Request, Response } from 'express';
import * as fundSessionService from '../services/fundSessionService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';
import { AppDataSource } from '../data-source.js';
import { User } from '../entity/User.js';
import { Fund } from '../entity/Fund.js';

const DEFAULT_FUND_ROLES = ['ADMIN', 'MANAGER', 'CASHIER'];

const userCanManageFund = (user?: User | null) => {
  if (!user) return false;
  if (user.canManageFund === true) return true;
  if (user.canManageFund === false) return false;
  return DEFAULT_FUND_ROLES.includes(String(user.role || '').toUpperCase());
};

export async function getActiveFundSession(req: Request, res: Response) {
  try {
    const { fundId, shiftId } = req.query as any;
    if (shiftId) {
      const session = await fundSessionService.getActiveFundSessionByShift(String(shiftId));
      return res.json(session || null);
    }
    if (!fundId) return res.status(400).json({ error: 'Missing fundId or shiftId' });
    const session = await fundSessionService.getActiveFundSessionByFund(String(fundId));
    res.json(session || null);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function openFundSession(req: Request, res: Response) {
  try {
    const { fundId, shiftId, cashierId, cashierName, openingBalance, notes } = req.body || {};
    if (!fundId || !shiftId || !cashierId || !cashierName) {
      return res.status(400).json({ error: 'Missing data' });
    }
    const userRepo = AppDataSource.getRepository(User);
    const cashier = await userRepo.findOneBy({ id: cashierId } as any);
    if (!userCanManageFund(cashier)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const saved = await fundSessionService.openFundSession({
      fundId,
      shiftId,
      cashierId,
      cashierName,
      openingBalance,
      notes,
    });
    void logAppAdminAction(req, 'insert', 'fund_session_open', saved.id, { fundId });
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function closeFundSession(req: Request, res: Response) {
  try {
    const { sessionId, closingBalance, notes, cashierId } = req.body || {};
    if (!sessionId || !cashierId) return res.status(400).json({ error: 'Missing data' });
    const userRepo = AppDataSource.getRepository(User);
    const cashier = await userRepo.findOneBy({ id: cashierId } as any);
    if (!userCanManageFund(cashier)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const saved = await fundSessionService.closeFundSession({ sessionId, closingBalance, notes });
    if (!saved) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'confirm', 'fund_session_close', saved.id, {
      closingBalance,
    });
    res.json(saved);
  } catch (e: any) {
    const msg = String(e?.message || 'Server error');
    const conflict =
      msg.includes('shifts serveur') || msg.includes('OPEN_SHIFTS') || msg.includes('cloturer la station');
    res.status(conflict ? 409 : 500).json({ error: msg });
  }
}

export async function addFundMovement(req: Request, res: Response) {
  try {
    const { sessionId, type, amount, reason, userId, userName } = req.body || {};
    if (!sessionId || !type || !reason) return res.status(400).json({ error: 'Missing data' });
    const userRepo = AppDataSource.getRepository(User);
    const user = userId ? await userRepo.findOneBy({ id: userId } as any) : null;
    if (!userCanManageFund(user)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const saved = await fundSessionService.addFundMovement({
      sessionId,
      type,
      amount,
      reason,
      userId: userId || null,
      userName: userName || null,
    });
    void logAppAdminAction(req, 'insert', 'fund_movement', saved.id, {
      sessionId,
      type,
      amount,
    });
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listFundMovements(req: Request, res: Response) {
  try {
    const { sessionId } = req.query as any;
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
    res.json(await fundSessionService.listFundMovements(String(sessionId)));
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listFundSessions(req: Request, res: Response) {
  try {
    const { from, to, fundId, cashierId, status } = req.query as any;

    const parseBoundary = (value: any): number | undefined => {
      if (!value && value !== 0) return undefined;
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) return asNumber;
      const asDate = Date.parse(String(value));
      return Number.isFinite(asDate) ? asDate : undefined;
    };

    const fromMs = parseBoundary(from);
    const toMs = parseBoundary(to);

    const sessions = await fundSessionService.listFundSessions({
      from: fromMs,
      to: toMs,
      fundId: fundId ? String(fundId) : undefined,
      cashierId: cashierId ? String(cashierId) : undefined,
      status: status ? String(status).toUpperCase() : undefined,
    });

    res.json(sessions);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
