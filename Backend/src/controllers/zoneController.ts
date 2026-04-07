import { Request, Response } from 'express';
import * as zoneService from '../services/zoneService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function listZones(req: Request, res: Response) {
  try { res.json(await zoneService.listZones()); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
}

export async function createZone(req: Request, res: Response) {
  try {
    const { name } = req.body;
    const z = await zoneService.createZone(name);
    void logAppAdminAction(req, 'insert', 'zone', z.id, { name: z.name });
    res.json(z);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function patchZone(req: Request, res: Response) {
  try {
    const updates = zoneService.normalizeZonePatch(req.body || {});
    const updated = await zoneService.updateZone(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'update', 'zone', req.params.id, {
      keys: Object.keys(updates || {}),
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteZone(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const ok = await zoneService.deleteZone(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'delete', 'zone', id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
