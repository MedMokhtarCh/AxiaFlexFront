import { Request, Response } from 'express';
import * as printerService from '../services/printerService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function listPrinters(req: Request, res: Response) {
  try { res.json(await printerService.listPrinters()); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
}

export async function createPrinter(req: Request, res: Response) {
  try {
    const { name, type, bonProfile } = req.body || {};
    const p = await printerService.createPrinter(name, type, bonProfile);
    res.json(p);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function patchPrinter(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Printer id requis' });
    const { name, type, bonProfile } = req.body || {};
    const updated = await printerService.updatePrinter(id, {
      name: name != null ? String(name) : undefined,
      type: type != null ? String(type) : undefined,
      bonProfile:
        bonProfile === null || bonProfile === undefined
          ? bonProfile
          : String(bonProfile),
    });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'update', 'printer', id, {
      name: updated.name,
      type: updated.type,
      bonProfile: (updated as any).bonProfile ?? null,
    });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Mise a jour imprimante impossible' });
  }
}

export async function deletePrinter(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const ok = await printerService.deletePrinter(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'delete', 'printer', id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listDetectedPrinters(req: Request, res: Response) {
  try { res.json(await printerService.listDetectedPrinters()); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
}

export async function testPrint(req: Request, res: Response) {
  try {
    const printerId = String(req.body?.printerId || '').trim();
    const raw = String(req.body?.station || 'KITCHEN').trim().toUpperCase();
    const station = raw === 'BAR' ? 'BAR' : 'KITCHEN';
    const result = await printerService.printProductionTest({
      printerId: printerId || undefined,
      station,
    });
    void logAppAdminAction(req, 'confirm', 'printer_test_print', printerId || 'default', {
      station,
    });
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Test impression impossible' });
  }
}

export async function testReceiptPrint(req: Request, res: Response) {
  try {
    const printerId = String(req.body?.printerId || '').trim();
    const result = await printerService.printReceiptTest({
      printerId: printerId || undefined,
    });
    void logAppAdminAction(req, 'confirm', 'printer_test_receipt_print', printerId || 'default', {});
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Test ticket client impossible' });
  }
}
