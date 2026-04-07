import { Request, Response } from 'express';
import { AppDataSource } from '../data-source.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';
import { Supplier } from '../entity/Supplier.js';
import { generateNextPrefixedCode } from '../services/prefixService.js';

const normalizeSupplierPayload = (payload: any) => ({
  name: String(payload?.name || '').trim(),
  contactName: payload?.contactName ? String(payload.contactName).trim() : null,
  email: payload?.email ? String(payload.email).trim() : null,
  phone: payload?.phone ? String(payload.phone).trim() : null,
  address: payload?.address ? String(payload.address).trim() : null,
  taxId: payload?.taxId ? String(payload.taxId).trim() : null,
});

export async function listSuppliers(_req: Request, res: Response) {
  try {
    const rows = await AppDataSource.getRepository(Supplier).find({
      order: { createdAt: 'DESC' } as any,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function createSupplier(req: Request, res: Response) {
  try {
    const normalized = normalizeSupplierPayload(req.body || {});
    if (!normalized.name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const saved = await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Supplier);
      const entity = repo.create({
        ...normalized,
        code: await generateNextPrefixedCode(manager, 'supplier', { pad: 6 }),
        createdAt: Date.now(),
      } as any);
      return repo.save(entity as any);
    });

    void logAppAdminAction(req, 'insert', 'supplier', saved.id, {
      name: (saved as any).name,
    });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function patchSupplier(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing supplier id' });

    const repo = AppDataSource.getRepository(Supplier);
    const existing = await repo.findOneBy({ id } as any);
    if (!existing)
      return res.status(404).json({ error: 'Supplier not found' });

    const normalized = normalizeSupplierPayload({
      ...existing,
      ...(req.body || {}),
    });
    if (!normalized.name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    Object.assign(existing, normalized);
    const saved = await repo.save(existing as any);
    void logAppAdminAction(req, 'update', 'supplier', id);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function deleteSupplier(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing supplier id' });

    const repo = AppDataSource.getRepository(Supplier);
    const existing = await repo.findOneBy({ id } as any);
    if (!existing)
      return res.status(404).json({ error: 'Supplier not found' });

    await repo.delete({ id } as any);
    void logAppAdminAction(req, 'delete', 'supplier', id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}
