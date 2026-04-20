import { Request, Response } from 'express';
import * as stockService from '../services/stockService.js';
import * as inventoryWorkflowService from '../services/inventoryWorkflowService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function listMovements(req: Request, res: Response) {
  try {
    const movements = await stockService.listMovements();
    res.json(movements);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function patchMovement(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const updates = req.body || {};
    const repo = (await import('../data-source.js')).AppDataSource.getRepository((await import('../entity/StockMovement.js')).StockMovement);
    const existing = await repo.findOneBy({ id } as any);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    // Only allow updating metadata: note, approvedBy, userName, unitCost
    const allowed: any = {};
    if (typeof updates.note !== 'undefined') allowed.note = updates.note;
    if (typeof updates.approvedBy !== 'undefined') allowed.approvedBy = updates.approvedBy;
    if (typeof updates.userName !== 'undefined') allowed.userName = updates.userName;
    if (typeof updates.unitCost !== 'undefined') allowed.unitCost = updates.unitCost;
    await repo.update(id, allowed as any);
    const updated = await repo.findOneBy({ id } as any);
    void logAppAdminAction(req, 'update', 'stock_movement', id, { keys: Object.keys(allowed) });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function deleteMovement(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const repo = (await import('../data-source.js')).AppDataSource.getRepository((await import('../entity/StockMovement.js')).StockMovement);
    const existing = await repo.findOneBy({ id } as any);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    // NOTE: deleting a movement does NOT revert stock levels automatically.
    // For safety we perform a simple delete; callers should ensure business rules.
    await repo.delete(id);
    void logAppAdminAction(req, 'delete', 'stock_movement', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function createMovement(req: Request, res: Response) {
  try {
    const { productId, type, quantity, note, userName, variantId, unitCost, batchNo, expiryAt, warehouseId, branchId } = req.body ?? {};
    if (!productId || !type) return res.status(400).json({ error: 'Missing data' });
    if (type !== 'IN' && type !== 'OUT') return res.status(400).json({ error: 'Invalid type' });

    const result = await stockService.createMovement({
      productId,
      variantId: variantId || null,
      type,
      quantity,
      note,
      userName,
      unitCost,
      batchNo,
      expiryAt,
      warehouseId,
      branchId,
    });

    if (!result) return res.status(400).json({ error: 'Invalid movement' });
    void logAppAdminAction(req, 'insert', 'stock_movement', (result as any)?.id ?? null, {
      productId,
      type,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listWarehouses(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.listWarehouses();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createWarehouse(req: Request, res: Response) {
  try {
    const { code, name, branchId } = req.body ?? {};
    const saved = await inventoryWorkflowService.createWarehouse({ code, name, branchId });
    if (!saved) return res.status(400).json({ error: 'Invalid warehouse' });
    void logAppAdminAction(req, 'insert', 'warehouse', saved.id, { code });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function patchWarehouse(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    const saved = await inventoryWorkflowService.updateWarehouse(id, req.body || {});
    if (!saved) return res.status(400).json({ error: 'Invalid warehouse' });
    void logAppAdminAction(req, 'update', 'warehouse', id);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function removeWarehouse(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    const ok = await inventoryWorkflowService.deleteWarehouse(id);
    if (!ok) return res.status(404).json({ error: 'Warehouse not found' });
    void logAppAdminAction(req, 'delete', 'warehouse', id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function listTransfers(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.listTransfers();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function requestTransfer(req: Request, res: Response) {
  try {
    const saved = await inventoryWorkflowService.requestTransfer(req.body || {});
    if (!saved) return res.status(400).json({ error: 'Invalid transfer request' });
    void logAppAdminAction(req, 'insert', 'stock_transfer_request', saved.id);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function approveTransfer(req: Request, res: Response) {
  try {
    const transferId = req.params.id;
    const approvedBy = req.body?.approvedBy || null;
    const saved = await inventoryWorkflowService.approveTransfer({ transferId, approvedBy });
    if (!saved) return res.status(400).json({ error: 'Transfer cannot be approved' });
    void logAppAdminAction(req, 'confirm', 'stock_transfer', transferId);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function rejectTransfer(req: Request, res: Response) {
  try {
    const transferId = req.params.id;
    const rejectedBy = req.body?.rejectedBy || null;
    const reason = req.body?.reason || null;
    const saved = await inventoryWorkflowService.rejectTransfer({ transferId, rejectedBy, reason });
    if (!saved) return res.status(400).json({ error: 'Transfer cannot be rejected' });
    void logAppAdminAction(req, 'cancel', 'stock_transfer', transferId, { reason });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function listAdjustments(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.listAdjustments();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function requestAdjustment(req: Request, res: Response) {
  try {
    const saved = await inventoryWorkflowService.requestAdjustment(req.body || {});
    if (!saved) return res.status(400).json({ error: 'Invalid adjustment request' });
    void logAppAdminAction(req, 'insert', 'stock_adjustment_request', saved.id);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function approveAdjustment(req: Request, res: Response) {
  try {
    const adjustmentId = req.params.id;
    const approvedBy = req.body?.approvedBy || null;
    const saved = await inventoryWorkflowService.approveAdjustment({ adjustmentId, approvedBy });
    if (!saved) return res.status(400).json({ error: 'Adjustment cannot be approved' });
    void logAppAdminAction(req, 'confirm', 'stock_adjustment', adjustmentId);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function rejectAdjustment(req: Request, res: Response) {
  try {
    const adjustmentId = req.params.id;
    const rejectedBy = req.body?.rejectedBy || null;
    const reason = req.body?.reason || null;
    const saved = await inventoryWorkflowService.rejectAdjustment({ adjustmentId, rejectedBy, reason });
    if (!saved) return res.status(400).json({ error: 'Adjustment cannot be rejected' });
    void logAppAdminAction(req, 'cancel', 'stock_adjustment', adjustmentId, { reason });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportDailyMovements(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getMovementReportDaily({ day: req.query?.day as string | undefined });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportIngredientConsumption(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getIngredientConsumptionReport({
      from: req.query?.from ? Number(req.query.from) : undefined,
      to: req.query?.to ? Number(req.query.to) : undefined,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportStockValuation(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getStockValuationReport();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportStockAging(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getStockAgingReport();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportExpiryTracking(req: Request, res: Response) {
  try {
    const withinDays = req.query?.withinDays ? Number(req.query.withinDays) : undefined;
    const rows = await inventoryWorkflowService.getExpiryTrackingReport({ withinDays });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportDeadStock(req: Request, res: Response) {
  try {
    const inactiveDays = req.query?.inactiveDays ? Number(req.query.inactiveDays) : undefined;
    const rows = await inventoryWorkflowService.getDeadStockReport({ inactiveDays });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportTheoreticalVsActual(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getTheoreticalVsActualReport();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportCogsByOrder(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getCogsByOrderReport({
      from: req.query?.from ? Number(req.query.from) : undefined,
      to: req.query?.to ? Number(req.query.to) : undefined,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportCogsByDay(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getCogsByDayReport({
      from: req.query?.from ? Number(req.query.from) : undefined,
      to: req.query?.to ? Number(req.query.to) : undefined,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportProductProfitability(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getProductProfitabilityReport({
      from: req.query?.from ? Number(req.query.from) : undefined,
      to: req.query?.to ? Number(req.query.to) : undefined,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function createStockDocument(req: Request, res: Response) {
  try {
    const saved = await inventoryWorkflowService.createStockDocument(req.body || {});
    if (!saved) return res.status(400).json({ error: 'Invalid stock document' });
    void logAppAdminAction(req, 'insert', 'stock_document', saved.id);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function listStockDocuments(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.listStockDocuments({
      type: req.query?.type ? String(req.query.type) : undefined,
      from: req.query?.from ? Number(req.query.from) : undefined,
      to: req.query?.to ? Number(req.query.to) : undefined,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function downloadStockDocumentPdf(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const out = await inventoryWorkflowService.getStockDocumentPdfBuffer(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.send(out.buffer);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportRealtimeStockState(_req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getRealtimeStockState();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function listAvailableLotsForSale(req: Request, res: Response) {
  try {
    const productId = String(req.query?.productId || '').trim();
    const variantId = req.query?.variantId ? String(req.query.variantId) : null;
    const rows = await inventoryWorkflowService.listAvailableLotsForSale({
      productId,
      variantId,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportRealtimeStockDetails(req: Request, res: Response) {
  try {
    const productId = String(req.query?.productId || '').trim();
    if (!productId) return res.status(400).json({ error: 'productId requis' });
    const out = await inventoryWorkflowService.getRealtimeStockDetails(productId);
    if (!out) return res.status(404).json({ error: 'Produit introuvable' });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function patchStockDocument(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const saved = await inventoryWorkflowService.updateStockDocument(id, req.body || {});
    if (!saved) return res.status(404).json({ error: 'Document not found' });
    void logAppAdminAction(req, 'update', 'stock_document', id);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function deleteStockDocumentLine(req: Request, res: Response) {
  try {
    const documentId = String(req.params.id || '').trim();
    const lineId = String(req.params.lineId || '').trim();
    if (!documentId || !lineId) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    const saved = await inventoryWorkflowService.deleteStockDocumentLine(
      documentId,
      lineId,
      req.body?.userName || null,
    );
    if (!saved) return res.status(404).json({ error: 'Document not found' });
    void logAppAdminAction(req, 'delete', 'stock_document_line', `${documentId}/${lineId}`);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function reportProductMovements(req: Request, res: Response) {
  try {
    const rows = await inventoryWorkflowService.getProductMovementReport({
      productId: req.query?.productId ? String(req.query.productId) : undefined,
      from: req.query?.from ? Number(req.query.from) : undefined,
      to: req.query?.to ? Number(req.query.to) : undefined,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}
