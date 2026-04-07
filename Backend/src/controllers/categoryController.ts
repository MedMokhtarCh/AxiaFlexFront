import { Request, Response } from 'express';
import * as categoryService from '../services/categoryService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function listCategories(req: Request, res: Response) {
  try { res.json(await categoryService.listCategories()); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
}

export async function createCategory(req: Request, res: Response) {
  try {
    const { name, parentId } = req.body;
    const c = await categoryService.createCategory(name, parentId);
    void logAppAdminAction(req, 'insert', 'category', c.id, {
      name: c.name,
      parentId: c.parentId ?? null,
    });
    res.json(c);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteCategory(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const rows = await categoryService.listCategories();
    const before = (rows || []).find((r: any) => String(r.id) === String(id));
    const ok = await categoryService.deleteCategory(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'delete', 'category', id, {
      name: before?.name ?? null,
      parentId: before?.parentId ?? null,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function patchCategory(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const { name, parentId } = req.body ?? {};
    const rows = await categoryService.listCategories();
    const before = (rows || []).find((r: any) => String(r.id) === String(id));
    const updates: any = {};
    if (name !== undefined) updates.name = typeof name === 'string' ? name.trim() : name;
    if (parentId !== undefined) updates.parentId = parentId || null;
    const updated = await categoryService.updateCategory(id, updates);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'update', 'category', id, {
      keys: Object.keys(updates),
      before: before
        ? { name: before.name, parentId: before.parentId ?? null }
        : null,
      after: { name: updated.name, parentId: (updated as any).parentId ?? null },
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
