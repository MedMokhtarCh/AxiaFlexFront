import { Request, Response } from 'express';
import * as userService from '../services/userService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function listUsers(req: Request, res: Response) {
  try { res.json(await userService.listUsers()); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
}

export async function createUser(req: Request, res: Response) {
  try {
    const u = await userService.createUser(req.body);
    void logAppAdminAction(req, 'insert', 'user', u.id, { name: u.name, role: u.role });
    res.json(u);
  } catch (e: any) {
    const msg = String(e?.message || 'Server error');
    const code = /Limite|Licence/i.test(msg) ? 403 : 500;
    res.status(code).json({ error: msg });
  }
}

export async function patchUser(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const updated = await userService.updateUser(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'update', 'user', id, {
      keys: Object.keys(req.body || {}),
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const ok = await userService.deleteUser(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'delete', 'user', id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
