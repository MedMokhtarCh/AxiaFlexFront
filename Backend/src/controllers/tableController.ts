import { Request, Response } from 'express';
import * as tableService from '../services/tableService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';
import { optionalPlanPercent } from '../utils/planLayout.js';

export async function listTables(req: Request, res: Response) {
  try { res.json(await tableService.listTables()); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
}

export async function createTable(req: Request, res: Response) {
  try {
    const {
      number,
      zoneId,
      capacity,
      planX,
      planY,
      planW,
      planH,
      planShape,
    } = req.body || {};
    const t = await tableService.createTable(number, zoneId, capacity, {
      planX,
      planY,
      planW,
      planH,
      planShape,
    });
    void logAppAdminAction(req, 'insert', 'table', t.id, { number: t.number });
    res.json(t);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteTable(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const ok = await tableService.deleteTable(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'delete', 'table', id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function patchTable(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const {
      status,
      number,
      zoneId,
      capacity,
      reservedBy,
      reservedAt,
      reservedUntil,
      planX,
      planY,
      planW,
      planH,
      planShape,
    } = req.body || {};
    const updates: any = {};
    if (status !== undefined) updates.status = status;
    if (number !== undefined) updates.number = number;
    if (zoneId !== undefined) updates.zoneId = zoneId;
    if (capacity !== undefined) updates.capacity = capacity;
    if (reservedBy !== undefined) updates.reservedBy = reservedBy;
    if (reservedAt !== undefined) updates.reservedAt = reservedAt;
    if (reservedUntil !== undefined) updates.reservedUntil = reservedUntil;
    if (planX !== undefined) updates.planX = optionalPlanPercent(planX) ?? null;
    if (planY !== undefined) updates.planY = optionalPlanPercent(planY) ?? null;
    if (planW !== undefined) updates.planW = optionalPlanPercent(planW) ?? null;
    if (planH !== undefined) updates.planH = optionalPlanPercent(planH) ?? null;
    if (planShape !== undefined) {
      updates.planShape =
        planShape === 'square' || planShape === 'rect'
          ? planShape
          : null;
    }
    const updated = await tableService.updateTable(id, updates as any);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'update', 'table', id, { keys: Object.keys(updates) });
    res.json(updated);
  } catch (e) {
    console.error('Table update failed', e);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listReservations(req: Request, res: Response) {
  try {
    res.json(await tableService.listReservations());
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
