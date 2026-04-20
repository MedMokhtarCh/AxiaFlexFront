import { Request, Response } from 'express';
import * as shiftService from '../services/shiftService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function getActiveShift(req: Request, res: Response) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    const shift = await shiftService.getActiveShift(userId);
    res.json(shift || null);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getLatestOpenShift(req: Request, res: Response) {
  try {
    const shift = await shiftService.getLatestOpenShift();
    res.json(shift || null);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function openShift(req: Request, res: Response) {
  try {
    const {
      cashierId,
      cashierName,
      fundId,
      fundName,
      openedById,
      openedByName,
      role,
      notes,
      openingFund,
    } = req.body || {};
    if (!cashierId || !cashierName) {
      return res.status(400).json({ error: 'Missing cashier data' });
    }
    const shift = await shiftService.openShift({
      cashierId,
      cashierName,
      fundId,
      fundName,
      openedById,
      openedByName,
      role,
      notes,
      openingFund,
    });
    void logAppAdminAction(req, 'insert', 'shift_open', shift.id, { cashierId });
    res.json(shift);
  } catch (e) {
    const message = (e as any)?.message || 'Server error';
    const status = 500;
    res.status(status).json({ error: message });
  }
}

export async function closeShift(req: Request, res: Response) {
  try {
    const { shiftId, userId, closingFund, notes } = req.body || {};
    if (!shiftId && !userId) {
      return res.status(400).json({ error: 'Missing shiftId or userId' });
    }
    const shift = await shiftService.closeShift({
      shiftId,
      userId,
      closingFund,
      notes,
    });
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    void logAppAdminAction(req, 'confirm', 'shift_close', shift.id);
    res.json(shift);
  } catch (e) {
    const message = (e as any)?.message || 'Server error';
    const conflict =
      message.includes('Active orders') ||
      message.includes('Fund session') ||
      message.includes('station de caisse') ||
      message.includes('Session de caisse');
    res.status(conflict ? 409 : 500).json({ error: message });
  }
}

export async function listShifts(req: Request, res: Response) {
  try {
    res.json(await shiftService.listShifts());
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listShiftSummaries(req: Request, res: Response) {
  try {
    res.json(await shiftService.listShiftSummaries());
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
