import { Between, In } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { Warehouse } from '../entity/Warehouse.js';
import { StockTransfer } from '../entity/StockTransfer.js';
import { StockAdjustment } from '../entity/StockAdjustment.js';
import { StockMovement } from '../entity/StockMovement.js';
import { Product } from '../entity/Product.js';
import { StockLot } from '../entity/StockLot.js';
import { Order } from '../entity/Order.js';
import { StockDocument } from '../entity/StockDocument.js';
import { StockDocumentLine } from '../entity/StockDocumentLine.js';
import { applyStockMovement, listMovements } from './stockService.js';
import { generateNextPrefixedCode } from './prefixService.js';

const toNumber = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const DOCUMENT_TYPES = new Set(['ENTRY', 'OUT', 'TRANSFER', 'INVENTORY']);

async function rollbackDocumentMovements(
  manager: any,
  documentCode: string,
  userName?: string | null,
) {
  const movementRepo = manager.getRepository(StockMovement);
  const movements = await movementRepo.find({
    where: {
      referenceType: 'STOCK_DOCUMENT',
      referenceId: documentCode,
    } as any,
    order: { createdAt: 'DESC' } as any,
  });

  for (const mv of movements as any[]) {
    const oppositeType = mv.type === 'IN' ? 'OUT' : 'IN';
    const quantity = toNumber(mv.quantity);
    if (quantity <= 0) continue;
    const out = await applyStockMovement({
      productId: mv.productId,
      variantId: mv.variantId || null,
      type: oppositeType,
      quantity,
      userName: userName || null,
      reason: 'STOCK_DOCUMENT_ROLLBACK',
      referenceType: 'STOCK_DOCUMENT_ROLLBACK',
      referenceId: documentCode,
      branchId: mv.branchId || null,
      warehouseId: mv.warehouseId || null,
      note: `Rollback ${documentCode}`,
      allowNegativeStock: false,
      unitCost: oppositeType === 'IN' ? mv.unitCost || null : undefined,
    }, manager);
    if (!out) throw new Error(`Rollback failed for movement ${mv.id}`);
  }
}

export async function createStockDocument(payload: {
  type: 'ENTRY' | 'OUT' | 'TRANSFER' | 'INVENTORY';
  warehouseId?: string | null;
  targetWarehouseId?: string | null;
  branchId?: string | null;
  note?: string | null;
  userName?: string | null;
  supplierId?: string | null;
  externalRef?: string | null;
  documentDate?: number | null;
  lines: {
    productId: string;
    variantId?: string | null;
    quantity: number;
    movementType?: 'IN' | 'OUT';
    note?: string | null;
    unitCost?: number | null;
  }[];
}) {
  const docType = String(payload.type || '').trim().toUpperCase();
  if (!DOCUMENT_TYPES.has(docType)) return null;

  const allowZeroQuantity = docType === 'INVENTORY';
  const lines = (Array.isArray(payload.lines) ? payload.lines : [])
    .map((line) => ({
      productId: String(line?.productId || '').trim(),
      variantId: line?.variantId || null,
      quantity: toNumber(line?.quantity),
      movementType: line?.movementType === 'IN' || line?.movementType === 'OUT' ? line.movementType : undefined,
      note: line?.note || null,
      unitCost: line?.unitCost != null ? toNumber(line.unitCost) : null,
    }))
    .filter((line) =>
      line.productId &&
      (allowZeroQuantity ? line.quantity >= 0 : line.quantity > 0),
    );

  if (lines.length === 0) return null;

  return AppDataSource.transaction(async (manager) => {
    const docRepo = manager.getRepository(StockDocument);
    const lineRepo = manager.getRepository(StockDocumentLine);
    const productRepo = manager.getRepository(Product);

    const code = await generateNextPrefixedCode(manager, 'stockDocument', { pad: 6 });
    const document = await docRepo.save(docRepo.create({
      code,
      type: docType,
      status: 'POSTED',
      warehouseId: payload.warehouseId || null,
      targetWarehouseId: payload.targetWarehouseId || null,
      branchId: payload.branchId || null,
      note: payload.note || null,
      userName: payload.userName || null,
      supplierId: payload.supplierId || null,
      externalRef: payload.externalRef || null,
      documentDate: payload.documentDate || null,
      createdAt: Date.now(),
    } as any) as any);

    for (const line of lines) {
      let movementType: 'IN' | 'OUT' =
        docType === 'ENTRY'
          ? 'IN'
          : docType === 'OUT'
            ? 'OUT'
            : 'OUT';
      let movementQty = line.quantity;

      // INVENTORY = set stock to the entered quantity (absolute), not add/subtract directly.
      if (docType === 'INVENTORY') {
        const product = await productRepo.findOneBy({ id: line.productId } as any);
        if (!product) throw new Error(`Unknown product ${line.productId}`);
        const currentQty = line.variantId
          ? Number(
              (Array.isArray(product.variants) ? product.variants : []).find(
                (v: any) => v?.id === line.variantId,
              )?.stock || 0,
            )
          : Number(product.stock || 0);
        const targetQty = Number(line.quantity || 0);
        const delta = targetQty - currentQty;
        movementType = delta >= 0 ? 'IN' : 'OUT';
        movementQty = Math.abs(delta);
      }

      let out: any = null;
      if (movementQty > 0) {
        out = await applyStockMovement({
          productId: line.productId,
          variantId: line.variantId,
          type: movementType,
          quantity: movementQty,
          userName: payload.userName || null,
          reason: `${docType}_${movementType}`,
          referenceType: 'STOCK_DOCUMENT',
          referenceId: document.code,
          branchId: payload.branchId || null,
          warehouseId: payload.warehouseId || null,
          note: line.note || payload.note || null,
          allowNegativeStock: false,
          unitCost:
            docType === 'ENTRY'
              ? line.unitCost || null
              : docType === 'INVENTORY' && movementType === 'IN'
                ? line.unitCost || null
                : undefined,
        }, manager);
        if (!out) throw new Error(`Invalid stock movement for product ${line.productId}`);
      }

      if (docType === 'TRANSFER') {
        const incoming = await applyStockMovement({
          productId: line.productId,
          variantId: line.variantId,
          type: 'IN',
          quantity: movementQty,
          userName: payload.userName || null,
          reason: `${docType}_IN`,
          referenceType: 'STOCK_DOCUMENT',
          referenceId: document.code,
          branchId: payload.branchId || null,
          warehouseId: payload.targetWarehouseId || null,
          note: line.note || payload.note || null,
          allowNegativeStock: false,
          unitCost: Number((out as any)?.movement?.unitCost || 0) || null,
        }, manager);
        if (!incoming) throw new Error(`Invalid transfer input for product ${line.productId}`);
      }

      await lineRepo.save(lineRepo.create({
        documentId: document.id,
        productId: line.productId,
        variantId: line.variantId || null,
        movementType,
        quantity: docType === 'INVENTORY' ? line.quantity : movementQty,
        note: line.note || null,
        createdAt: Date.now(),
      } as any) as any);
    }

    const savedLines = await lineRepo.find({ where: { documentId: document.id } as any, order: { createdAt: 'ASC' } as any });
    return { ...document, lines: savedLines };
  });
}

export async function listStockDocuments(params?: { from?: number; to?: number; type?: string | null }) {
  const repo = AppDataSource.getRepository(StockDocument);
  const lineRepo = AppDataSource.getRepository(StockDocumentLine);
  const where: any = {};
  const from = toNumber(params?.from);
  const to = toNumber(params?.to);
  if (from > 0 && to > 0) where.createdAt = Between(from, to);
  if (params?.type) where.type = String(params.type).toUpperCase();
  const docs = await repo.find({ where, order: { createdAt: 'DESC' } as any });
  if (docs.length === 0) return [];
  const docIds = docs.map((doc) => doc.id);
  const lines = await lineRepo.find({ where: { documentId: In(docIds) } as any, order: { createdAt: 'ASC' } as any });
  const byDoc = new Map<string, any[]>();
  for (const line of lines as any[]) {
    const list = byDoc.get(line.documentId) || [];
    list.push(line);
    byDoc.set(line.documentId, list);
  }
  return docs.map((doc) => ({ ...doc, lines: byDoc.get(doc.id) || [] }));
}

export async function updateStockDocument(
  id: string,
  payload: {
    type?: 'ENTRY' | 'OUT' | 'TRANSFER' | 'INVENTORY';
    note?: string | null;
    userName?: string | null;
    documentDate?: number | null;
    lines?: {
      productId: string;
      variantId?: string | null;
      quantity: number;
      movementType?: 'IN' | 'OUT';
      note?: string | null;
      unitCost?: number | null;
    }[];
  },
) {
  return AppDataSource.transaction(async (manager) => {
    const docRepo = manager.getRepository(StockDocument);
    const lineRepo = manager.getRepository(StockDocumentLine);

    const doc = await docRepo.findOneBy({ id } as any);
    if (!doc) return null;

    await rollbackDocumentMovements(manager, doc.code, payload.userName || null);

    const newType = payload?.type ? String(payload.type).toUpperCase() : doc.type;
    if (!DOCUMENT_TYPES.has(newType)) throw new Error('Invalid stock document type');

    const allowZeroQuantity = newType === 'INVENTORY';
    const incomingLines = (Array.isArray(payload?.lines) ? payload.lines : [])
      .map((line) => ({
        productId: String(line?.productId || '').trim(),
        variantId: line?.variantId || null,
        quantity: toNumber(line?.quantity),
        movementType:
          line?.movementType === 'IN' || line?.movementType === 'OUT'
            ? line.movementType
            : undefined,
        note: line?.note || null,
        unitCost: line?.unitCost != null ? toNumber(line.unitCost) : null,
      }))
      .filter((line) =>
        line.productId &&
        (allowZeroQuantity ? line.quantity >= 0 : line.quantity > 0),
      );

    if (incomingLines.length === 0) throw new Error('At least one valid line is required');

    doc.type = newType as any;
    doc.note = payload?.note ?? doc.note ?? null;
    doc.documentDate = payload?.documentDate ?? doc.documentDate ?? null;
    doc.userName = payload?.userName ?? doc.userName ?? null;
    await docRepo.save(doc as any);

    await lineRepo.delete({ documentId: doc.id } as any);

    // Re-apply with updated lines/types.
    const productRepo = manager.getRepository(Product);
    for (const line of incomingLines) {
      let movementType: 'IN' | 'OUT' =
        newType === 'ENTRY'
          ? 'IN'
          : newType === 'OUT'
            ? 'OUT'
            : 'OUT';
      let movementQty = line.quantity;

      if (newType === 'INVENTORY') {
        const product = await productRepo.findOneBy({ id: line.productId } as any);
        if (!product) throw new Error(`Unknown product ${line.productId}`);
        const currentQty = line.variantId
          ? Number(
              (Array.isArray(product.variants) ? product.variants : []).find(
                (v: any) => v?.id === line.variantId,
              )?.stock || 0,
            )
          : Number(product.stock || 0);
        const targetQty = Number(line.quantity || 0);
        const delta = targetQty - currentQty;
        movementType = delta >= 0 ? 'IN' : 'OUT';
        movementQty = Math.abs(delta);
      }

      let out: any = null;
      if (movementQty > 0) {
        out = await applyStockMovement({
          productId: line.productId,
          variantId: line.variantId,
          type: movementType,
          quantity: movementQty,
          userName: payload.userName || null,
          reason: `${newType}_${movementType}`,
          referenceType: 'STOCK_DOCUMENT',
          referenceId: doc.code,
          branchId: doc.branchId || null,
          warehouseId: doc.warehouseId || null,
          note: line.note || payload.note || null,
          allowNegativeStock: false,
          unitCost:
            newType === 'ENTRY'
              ? line.unitCost || null
              : newType === 'INVENTORY' && movementType === 'IN'
                ? line.unitCost || null
                : undefined,
        }, manager);
        if (!out) throw new Error(`Invalid stock movement for product ${line.productId}`);
      }

      if (newType === 'TRANSFER') {
        const incoming = await applyStockMovement({
          productId: line.productId,
          variantId: line.variantId,
          type: 'IN',
          quantity: movementQty,
          userName: payload.userName || null,
          reason: `${newType}_IN`,
          referenceType: 'STOCK_DOCUMENT',
          referenceId: doc.code,
          branchId: doc.branchId || null,
          warehouseId: doc.targetWarehouseId || null,
          note: line.note || payload.note || null,
          allowNegativeStock: false,
          unitCost: Number((out as any)?.movement?.unitCost || 0) || null,
        }, manager);
        if (!incoming) throw new Error(`Invalid transfer input for product ${line.productId}`);
      }

      await lineRepo.save(lineRepo.create({
        documentId: doc.id,
        productId: line.productId,
        variantId: line.variantId || null,
        movementType,
        quantity: newType === 'INVENTORY' ? line.quantity : movementQty,
        note: line.note || null,
        createdAt: Date.now(),
      } as any) as any);
    }

    const savedLines = await lineRepo.find({
      where: { documentId: doc.id } as any,
      order: { createdAt: 'ASC' } as any,
    });
    return { ...doc, lines: savedLines };
  });
}

export async function deleteStockDocumentLine(
  documentId: string,
  lineId: string,
  userName?: string | null,
) {
  const docs = await listStockDocuments();
  const doc: any = docs.find((row: any) => row.id === documentId);
  if (!doc) return null;
  const remainingLines = (doc.lines || []).filter((line: any) => line.id !== lineId);
  if (remainingLines.length === 0) {
    throw new Error('Document must contain at least one line');
  }
  return updateStockDocument(documentId, {
    type: doc.type,
    note: doc.note || null,
    userName: userName || null,
    documentDate: doc.documentDate || null,
    lines: remainingLines.map((line: any) => ({
      productId: line.productId,
      variantId: line.variantId || null,
      quantity: Number(line.quantity || 0),
      movementType: line.movementType,
      note: line.note || null,
    })),
  });
}

export async function getProductMovementReport(params?: {
  productId?: string | null;
  from?: number;
  to?: number;
}) {
  const repo = AppDataSource.getRepository(StockMovement);
  const productRepo = AppDataSource.getRepository(Product);
  const where: any = {};
  if (params?.productId) where.productId = String(params.productId).trim();
  const from = toNumber(params?.from);
  const to = toNumber(params?.to);
  if (from > 0 && to > 0) where.createdAt = Between(from, to);

  const rows = await repo.find({ where, order: { createdAt: 'DESC' } as any });
  const productIds = Array.from(new Set(rows.map((row: any) => row.productId)));
  const products = productIds.length > 0 ? await productRepo.findBy({ id: In(productIds) } as any) : [];
  const byId = new Map(products.map((product) => [product.id, product]));
  const orderRepo = AppDataSource.getRepository(Order);

  const orderReferenceIds = Array.from(
    new Set(
      rows
        .filter((row: any) => row.referenceType === 'ORDER' && row.referenceId)
        .map((row: any) => String(row.referenceId).trim())
        .filter(Boolean),
    ),
  );

  const referencedOrders = orderReferenceIds.length > 0
    ? await orderRepo.findBy({ id: In(orderReferenceIds) } as any)
    : [];
  const orderTicketByOrderId = new Map(
    referencedOrders.map((order: any) => [
      order.id,
      order.ticketNumber || order.id,
    ]),
  );

  return rows.map((row: any) => ({
    id: row.id,
    productId: row.productId,
    productName: byId.get(row.productId)?.name || row.productId,
    createdAt: Number(row.createdAt || 0),
    ticketNumber:
      row.referenceType === 'ORDER'
        ? orderTicketByOrderId.get(String(row.referenceId || '')) || row.referenceId || null
        : row.referenceId || null,
    referenceType: row.referenceType || null,
    quantity: Number(row.quantity || 0),
    type: row.type,
    reason: row.reason || null,
  }));
}

export async function listWarehouses() {
  return AppDataSource.getRepository(Warehouse).find({ order: { createdAt: 'DESC' } as any });
}

export async function createWarehouse(payload: {
  code: string;
  name: string;
  branchId?: string | null;
}) {
  const repo = AppDataSource.getRepository(Warehouse);
  const data: Partial<Warehouse> = {
    code: String(payload.code || '').trim().toUpperCase(),
    name: String(payload.name || '').trim(),
    branchId: payload.branchId || null,
    isActive: true,
    createdAt: Date.now(),
  };
  if (!data.code || !data.name) return null;
  const entity = repo.create(data as any);
  return repo.save(entity as any);
}

export async function updateWarehouse(
  id: string,
  payload: { code?: string; name?: string; branchId?: string | null; isActive?: boolean },
) {
  const repo = AppDataSource.getRepository(Warehouse);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  if (payload.code !== undefined) existing.code = String(payload.code || '').trim().toUpperCase();
  if (payload.name !== undefined) existing.name = String(payload.name || '').trim();
  if (payload.branchId !== undefined) existing.branchId = payload.branchId || null;
  if (payload.isActive !== undefined) existing.isActive = Boolean(payload.isActive);
  if (!existing.code || !existing.name) return null;
  return repo.save(existing as any);
}

export async function deleteWarehouse(id: string) {
  const repo = AppDataSource.getRepository(Warehouse);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return false;
  await repo.remove(existing as any);
  return true;
}

export async function listTransfers() {
  return AppDataSource.getRepository(StockTransfer).find({ order: { createdAt: 'DESC' } as any });
}

export async function requestTransfer(payload: {
  sourceWarehouseId?: string | null;
  sourceBranchId?: string | null;
  destinationWarehouseId?: string | null;
  destinationBranchId?: string | null;
  items: { productId: string; quantity: number; variantId?: string | null; note?: string | null }[];
  note?: string | null;
  requestedBy?: string | null;
}) {
  const transferRepo = AppDataSource.getRepository(StockTransfer);
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .map((line) => ({
      productId: String(line?.productId || '').trim(),
      quantity: toNumber(line?.quantity),
      variantId: line?.variantId || null,
      note: line?.note || null,
    }))
    .filter((line) => line.productId && line.quantity > 0);

  if (items.length === 0) return null;
  if (!payload.sourceWarehouseId && !payload.sourceBranchId) return null;
  if (!payload.destinationWarehouseId && !payload.destinationBranchId) return null;

  const entity = transferRepo.create({
    status: 'REQUESTED',
    sourceWarehouseId: payload.sourceWarehouseId || null,
    sourceBranchId: payload.sourceBranchId || null,
    destinationWarehouseId: payload.destinationWarehouseId || null,
    destinationBranchId: payload.destinationBranchId || null,
    items,
    note: payload.note || null,
    requestedBy: payload.requestedBy || null,
    createdAt: Date.now(),
  } as any);

  return transferRepo.save(entity as any);
}

export async function approveTransfer(payload: {
  transferId: string;
  approvedBy?: string | null;
}) {
  return AppDataSource.transaction(async (manager) => {
    const transferRepo = manager.getRepository(StockTransfer);
    const transfer = await transferRepo.findOneBy({ id: payload.transferId } as any);
    if (!transfer || transfer.status !== 'REQUESTED') return null;

    const transferItems = Array.isArray(transfer.items) ? transfer.items : [];
    if (transferItems.length === 0) return null;

    for (const item of transferItems) {
      const quantity = toNumber((item as any).quantity);
      if (!quantity || quantity <= 0) continue;

      const outResult = await applyStockMovement({
        productId: (item as any).productId,
        variantId: (item as any).variantId || null,
        type: 'OUT',
        quantity,
        userName: payload.approvedBy || null,
        reason: 'TRANSFER_OUT',
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        branchId: transfer.sourceBranchId || null,
        warehouseId: transfer.sourceWarehouseId || null,
        note: (item as any).note || transfer.note || null,
        approvedBy: payload.approvedBy || null,
        allowNegativeStock: false,
      }, manager);
      if (!outResult) return null;

      const transferInUnitCost = Number((outResult as any)?.movement?.unitCost);

      const inResult = await applyStockMovement({
        productId: (item as any).productId,
        variantId: (item as any).variantId || null,
        type: 'IN',
        quantity,
        unitCost: Number.isFinite(transferInUnitCost) ? transferInUnitCost : null,
        userName: payload.approvedBy || null,
        reason: 'TRANSFER_IN',
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        branchId: transfer.destinationBranchId || null,
        warehouseId: transfer.destinationWarehouseId || null,
        note: (item as any).note || transfer.note || null,
        approvedBy: payload.approvedBy || null,
      }, manager);
      if (!inResult) return null;
    }

    transfer.status = 'COMPLETED';
    transfer.approvedBy = payload.approvedBy || null;
    transfer.approvedAt = Date.now();
    transfer.completedAt = Date.now();
    return transferRepo.save(transfer as any);
  });
}

export async function rejectTransfer(payload: {
  transferId: string;
  rejectedBy?: string | null;
  reason?: string | null;
}) {
  const repo = AppDataSource.getRepository(StockTransfer);
  const transfer = await repo.findOneBy({ id: payload.transferId } as any);
  if (!transfer || transfer.status !== 'REQUESTED') return null;
  transfer.status = 'REJECTED';
  transfer.rejectedBy = payload.rejectedBy || null;
  transfer.rejectionReason = payload.reason || null;
  return repo.save(transfer as any);
}

export async function listAdjustments() {
  return AppDataSource.getRepository(StockAdjustment).find({ order: { createdAt: 'DESC' } as any });
}

export async function requestAdjustment(payload: {
  productId: string;
  variantId?: string | null;
  kind: 'WASTAGE' | 'EXPIRED' | 'DAMAGE' | 'CORRECTION';
  type: 'IN' | 'OUT';
  quantity: number;
  warehouseId?: string | null;
  branchId?: string | null;
  reason?: string | null;
  note?: string | null;
  requestedBy?: string | null;
}) {
  const repo = AppDataSource.getRepository(StockAdjustment);
  const quantity = toNumber(payload.quantity);
  if (!payload.productId || quantity <= 0) return null;

  const entity = repo.create({
    status: 'PENDING',
    productId: payload.productId,
    variantId: payload.variantId || null,
    kind: payload.kind,
    type: payload.type,
    quantity,
    warehouseId: payload.warehouseId || null,
    branchId: payload.branchId || null,
    reason: payload.reason || null,
    note: payload.note || null,
    requestedBy: payload.requestedBy || null,
    createdAt: Date.now(),
  } as any);

  return repo.save(entity as any);
}

export async function approveAdjustment(payload: {
  adjustmentId: string;
  approvedBy?: string | null;
}) {
  return AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(StockAdjustment);
    const adjustment = await repo.findOneBy({ id: payload.adjustmentId } as any);
    if (!adjustment || adjustment.status !== 'PENDING') return null;

    const result = await applyStockMovement({
      productId: adjustment.productId,
      variantId: adjustment.variantId || null,
      type: adjustment.type,
      quantity: toNumber(adjustment.quantity),
      userName: adjustment.requestedBy || null,
      reason: adjustment.kind,
      referenceType: 'ADJUSTMENT',
      referenceId: adjustment.id,
      branchId: adjustment.branchId || null,
      warehouseId: adjustment.warehouseId || null,
      note: adjustment.reason || adjustment.note || null,
      approvedBy: payload.approvedBy || null,
      allowNegativeStock: false,
    }, manager);
    if (!result) return null;

    adjustment.status = 'APPROVED';
    adjustment.approvedBy = payload.approvedBy || null;
    adjustment.decidedAt = Date.now();
    return repo.save(adjustment as any);
  });
}

export async function rejectAdjustment(payload: {
  adjustmentId: string;
  rejectedBy?: string | null;
  reason?: string | null;
}) {
  const repo = AppDataSource.getRepository(StockAdjustment);
  const adjustment = await repo.findOneBy({ id: payload.adjustmentId } as any);
  if (!adjustment || adjustment.status !== 'PENDING') return null;

  adjustment.status = 'REJECTED';
  adjustment.rejectedBy = payload.rejectedBy || null;
  adjustment.rejectionReason = payload.reason || null;
  adjustment.decidedAt = Date.now();
  return repo.save(adjustment as any);
}

export async function getMovementReportDaily(params?: { day?: string | null }) {
  const dayString = String(params?.day || '').trim();
  const date = dayString ? new Date(`${dayString}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return [];
  const start = date.getTime();
  const end = start + 24 * 60 * 60 * 1000;
  const rows = await AppDataSource.getRepository(StockMovement).find({
    where: {
      createdAt: Between(start, end - 1),
    } as any,
    order: { createdAt: 'ASC' } as any,
  });
  return rows;
}

export async function getIngredientConsumptionReport(params?: { from?: number; to?: number }) {
  const from = toNumber(params?.from) || Date.now() - 7 * 24 * 60 * 60 * 1000;
  const to = toNumber(params?.to) || Date.now();
  const movements = await listMovements();
  const filtered = movements.filter((movement: any) =>
    movement.reason === 'SALE_RECIPE' &&
    Number(movement.createdAt) >= from &&
    Number(movement.createdAt) <= to,
  );

  const productIds = Array.from(new Set(filtered.map((movement: any) => movement.productId)));
  const products = await AppDataSource.getRepository(Product).findBy({ id: In(productIds) } as any);
  const productsById = new Map(products.map((product: any) => [product.id, product]));

  const map = new Map<string, { productId: string; productName: string; totalQuantity: number; unit: string }>();
  for (const movement of filtered) {
    const key = String(movement.productId);
    const existing = map.get(key) || {
      productId: key,
      productName: productsById.get(key)?.name || key,
      totalQuantity: 0,
      unit: movement.unit || productsById.get(key)?.baseUnit || productsById.get(key)?.unit || 'piece',
    };
    existing.totalQuantity += toNumber((movement as any).quantity);
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
}

export async function getStockValuationReport() {
  const lotRepo = AppDataSource.getRepository(StockLot);
  const productRepo = AppDataSource.getRepository(Product);
  const lots = await lotRepo.find();
  const activeLots = lots.filter((lot: any) => Number(lot.remainingQuantity || 0) > 0);

  const productIds = Array.from(new Set(activeLots.map((lot: any) => lot.productId)));
  const products = await productRepo.findBy({ id: In(productIds) } as any);
  const productsById = new Map(products.map((product) => [product.id, product]));

  const perProduct = new Map<string, {
    productId: string;
    productName: string;
    quantity: number;
    valuation: number;
    currency: string;
  }>();

  for (const lot of activeLots as any[]) {
    const quantity = Number(lot.remainingQuantity || 0);
    const unitCost = lot.unitCost === null || lot.unitCost === undefined ? 0 : Number(lot.unitCost || 0);
    const lineValue = quantity * unitCost;
    const key = String(lot.productId);
    const existing = perProduct.get(key) || {
      productId: key,
      productName: productsById.get(key)?.name || key,
      quantity: 0,
      valuation: 0,
      currency: 'DT',
    };
    existing.quantity += quantity;
    existing.valuation += lineValue;
    perProduct.set(key, existing);
  }

  const items = Array.from(perProduct.values()).sort((a, b) => b.valuation - a.valuation);
  const totalValuation = items.reduce((sum, item) => sum + Number(item.valuation || 0), 0);
  return { totalValuation, currency: 'DT', items };
}

export async function getStockAgingReport() {
  const lotRepo = AppDataSource.getRepository(StockLot);
  const productRepo = AppDataSource.getRepository(Product);
  const now = Date.now();
  const lots = (await lotRepo.find()).filter((lot: any) => Number(lot.remainingQuantity || 0) > 0);
  const productIds = Array.from(new Set(lots.map((lot: any) => lot.productId)));
  const products = await productRepo.findBy({ id: In(productIds) } as any);
  const productsById = new Map(products.map((product) => [product.id, product]));

  return lots.map((lot: any) => {
    const receivedAt = Number(lot.receivedAt || lot.createdAt || now);
    const ageDays = Math.floor((now - receivedAt) / (24 * 60 * 60 * 1000));
    let bucket = '91+ days';
    if (ageDays <= 30) bucket = '0-30 days';
    else if (ageDays <= 60) bucket = '31-60 days';
    else if (ageDays <= 90) bucket = '61-90 days';

    return {
      lotId: lot.id,
      productId: lot.productId,
      productName: productsById.get(lot.productId)?.name || lot.productId,
      batchNo: lot.batchNo || null,
      remainingQuantity: Number(lot.remainingQuantity || 0),
      unitCost: lot.unitCost === null || lot.unitCost === undefined ? null : Number(lot.unitCost || 0),
      ageDays,
      bucket,
      expiryAt: lot.expiryAt || null,
    };
  });
}

export async function getExpiryTrackingReport(params?: { withinDays?: number }) {
  const withinDays = Math.max(1, Number(params?.withinDays || 30));
  const now = Date.now();
  const until = now + withinDays * 24 * 60 * 60 * 1000;
  const lotRepo = AppDataSource.getRepository(StockLot);
  const productRepo = AppDataSource.getRepository(Product);
  const lots = (await lotRepo.find()).filter((lot: any) =>
    Number(lot.remainingQuantity || 0) > 0 &&
    lot.expiryAt &&
    Number(lot.expiryAt) >= now &&
    Number(lot.expiryAt) <= until,
  );

  const productIds = Array.from(new Set(lots.map((lot: any) => lot.productId)));
  const products = await productRepo.findBy({ id: In(productIds) } as any);
  const productsById = new Map(products.map((product) => [product.id, product]));

  return lots
    .map((lot: any) => ({
      lotId: lot.id,
      productId: lot.productId,
      productName: productsById.get(lot.productId)?.name || lot.productId,
      batchNo: lot.batchNo || null,
      remainingQuantity: Number(lot.remainingQuantity || 0),
      expiryAt: Number(lot.expiryAt),
      daysToExpire: Math.ceil((Number(lot.expiryAt) - now) / (24 * 60 * 60 * 1000)),
      warehouseId: lot.warehouseId || null,
      branchId: lot.branchId || null,
    }))
    .sort((a, b) => a.daysToExpire - b.daysToExpire);
}

export async function getDeadStockReport(params?: { inactiveDays?: number }) {
  const inactiveDays = Math.max(1, Number(params?.inactiveDays || 30));
  const products = await AppDataSource.getRepository(Product).find();
  const movements = await listMovements();

  const lastMovementByProduct = new Map<string, number>();
  for (const movement of movements as any[]) {
    const current = lastMovementByProduct.get(movement.productId) || 0;
    const timestamp = Number(movement.createdAt || 0);
    if (timestamp > current) lastMovementByProduct.set(movement.productId, timestamp);
  }

  return products
    .filter((product: any) => Number(product.stock || 0) > 0)
    .map((product: any) => {
      const lastMovementAt = lastMovementByProduct.get(product.id) || 0;
      const daysWithoutMovement = lastMovementAt
        ? Math.floor((Date.now() - lastMovementAt) / (24 * 60 * 60 * 1000))
        : inactiveDays + 1;
      return {
        productId: product.id,
        productName: product.name,
        stock: Number(product.stock || 0),
        unit: product.baseUnit || product.unit || 'piece',
        lastMovementAt: lastMovementAt || null,
        daysWithoutMovement,
      };
    })
    .filter((row) => row.daysWithoutMovement >= inactiveDays)
    .sort((a, b) => b.daysWithoutMovement - a.daysWithoutMovement);
}

export async function getTheoreticalVsActualReport() {
  const adjustmentRepo = AppDataSource.getRepository(StockAdjustment);
  const movementRepo = AppDataSource.getRepository(StockMovement);
  const productRepo = AppDataSource.getRepository(Product);

  const approvedCorrections = await adjustmentRepo.find({
    where: { status: 'APPROVED', kind: 'CORRECTION' } as any,
    order: { decidedAt: 'DESC', createdAt: 'DESC' } as any,
  });

  if (approvedCorrections.length === 0) return [];

  const correctionIds = approvedCorrections.map((adjustment) => adjustment.id);
  const movements = await movementRepo.find({
    where: { referenceType: 'ADJUSTMENT', referenceId: In(correctionIds) } as any,
    order: { createdAt: 'DESC' } as any,
  });

  const movementByAdjustment = new Map<string, any>();
  for (const movement of movements as any[]) {
    if (!movement.referenceId) continue;
    if (!movementByAdjustment.has(movement.referenceId)) movementByAdjustment.set(movement.referenceId, movement);
  }

  const productIds = Array.from(new Set(approvedCorrections.map((adjustment) => adjustment.productId)));
  const products = await productRepo.findBy({ id: In(productIds) } as any);
  const productsById = new Map(products.map((product) => [product.id, product]));

  return approvedCorrections
    .map((adjustment) => {
      const movement = movementByAdjustment.get(adjustment.id);
      if (!movement) return null;
      const theoretical = Number(movement.quantityBefore || 0);
      const actual = Number(movement.quantityAfter || 0);
      return {
        adjustmentId: adjustment.id,
        productId: adjustment.productId,
        productName: productsById.get(adjustment.productId)?.name || adjustment.productId,
        warehouseId: adjustment.warehouseId || null,
        branchId: adjustment.branchId || null,
        theoreticalQuantity: theoretical,
        actualQuantity: actual,
        varianceQuantity: actual - theoretical,
        decidedAt: adjustment.decidedAt || adjustment.createdAt,
        decidedBy: adjustment.approvedBy || null,
      };
    })
    .filter(Boolean);
}

export async function getCogsByOrderReport(params?: { from?: number; to?: number }) {
  const from = toNumber(params?.from) || Date.now() - 7 * 24 * 60 * 60 * 1000;
  const to = toNumber(params?.to) || Date.now();

  const movementRepo = AppDataSource.getRepository(StockMovement);
  const orderRepo = AppDataSource.getRepository(Order);

  const cogsMovements = await movementRepo.find({
    where: {
      referenceType: 'ORDER',
      reason: 'SALE_RECIPE',
      createdAt: Between(from, to),
    } as any,
    order: { createdAt: 'ASC' } as any,
  });

  const cogsByOrder = new Map<string, number>();
  for (const movement of cogsMovements as any[]) {
    const orderId = String(movement.referenceId || '').trim();
    if (!orderId) continue;
    const current = cogsByOrder.get(orderId) || 0;
    cogsByOrder.set(orderId, current + Number(movement.totalCost || 0));
  }

  const orderIds = Array.from(cogsByOrder.keys());
  if (orderIds.length === 0) return [];
  const orders = await orderRepo.findBy({ id: In(orderIds) } as any);
  const orderById = new Map(orders.map((order) => [order.id, order]));

  return orderIds.map((orderId) => {
    const order = orderById.get(orderId);
    const revenue = Number(order?.total || 0);
    const cogs = Number(cogsByOrder.get(orderId) || 0);
    const grossProfit = revenue - cogs;
    return {
      orderId,
      createdAt: order?.createdAt || null,
      status: order?.status || null,
      revenue,
      cogs,
      grossProfit,
      grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    };
  }).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

export async function getCogsByDayReport(params?: { from?: number; to?: number }) {
  const from = toNumber(params?.from) || Date.now() - 30 * 24 * 60 * 60 * 1000;
  const to = toNumber(params?.to) || Date.now();
  const movementRepo = AppDataSource.getRepository(StockMovement);
  const orderRepo = AppDataSource.getRepository(Order);

  const cogsMovements = await movementRepo.find({
    where: {
      referenceType: 'ORDER',
      reason: 'SALE_RECIPE',
      createdAt: Between(from, to),
    } as any,
  });

  const cogsByOrder = new Map<string, number>();
  for (const movement of cogsMovements as any[]) {
    const orderId = String(movement.referenceId || '').trim();
    if (!orderId) continue;
    const current = cogsByOrder.get(orderId) || 0;
    cogsByOrder.set(orderId, current + Number(movement.totalCost || 0));
  }

  const orders = await orderRepo.find({
    where: { createdAt: Between(from, to) } as any,
  });

  const dayMap = new Map<string, { day: string; revenue: number; cogs: number; grossProfit: number; orderCount: number }>();
  for (const order of orders as any[]) {
    const day = new Date(Number(order.createdAt || 0)).toISOString().slice(0, 10);
    const revenue = Number(order.total || 0);
    const cogs = Number(cogsByOrder.get(order.id) || 0);
    const grossProfit = revenue - cogs;
    const existing = dayMap.get(day) || { day, revenue: 0, cogs: 0, grossProfit: 0, orderCount: 0 };
    existing.revenue += revenue;
    existing.cogs += cogs;
    existing.grossProfit += grossProfit;
    existing.orderCount += 1;
    dayMap.set(day, existing);
  }

  return Array.from(dayMap.values())
    .map((row) => ({
      ...row,
      grossMarginPct: row.revenue > 0 ? (row.grossProfit / row.revenue) * 100 : 0,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export async function getProductProfitabilityReport(params?: { from?: number; to?: number }) {
  const from = toNumber(params?.from) || Date.now() - 30 * 24 * 60 * 60 * 1000;
  const to = toNumber(params?.to) || Date.now();

  const orderRepo = AppDataSource.getRepository(Order);
  const productRepo = AppDataSource.getRepository(Product);
  const movementRepo = AppDataSource.getRepository(StockMovement);

  const orders = await orderRepo.find({ where: { createdAt: Between(from, to) } as any });
  const salesByProduct = new Map<string, { quantity: number; revenue: number }>();

  for (const order of orders as any[]) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const productId = String(item?.productId || '').trim();
      if (!productId) continue;
      const quantity = Number(item?.quantity || 0);
      const price = Number(item?.price || 0);
      if (quantity <= 0) continue;
      const existing = salesByProduct.get(productId) || { quantity: 0, revenue: 0 };
      existing.quantity += quantity;
      existing.revenue += quantity * price;
      salesByProduct.set(productId, existing);
    }
  }

  const cogsMovements = await movementRepo.find({
    where: {
      referenceType: 'ORDER',
      reason: 'SALE_RECIPE',
      createdAt: Between(from, to),
    } as any,
  });

  const cogsBySoldProduct = new Map<string, number>();
  for (const movement of cogsMovements as any[]) {
    const soldProductId = String(movement.sourceProductId || '').trim();
    if (!soldProductId) continue;
    const current = cogsBySoldProduct.get(soldProductId) || 0;
    cogsBySoldProduct.set(soldProductId, current + Number(movement.totalCost || 0));
  }

  const productIds = Array.from(new Set([...salesByProduct.keys(), ...cogsBySoldProduct.keys()]));
  const products = await productRepo.findBy({ id: In(productIds) } as any);
  const productsById = new Map(products.map((product) => [product.id, product]));

  return productIds
    .map((productId) => {
      const sales = salesByProduct.get(productId) || { quantity: 0, revenue: 0 };
      const cogs = Number(cogsBySoldProduct.get(productId) || 0);
      const grossProfit = sales.revenue - cogs;
      return {
        productId,
        productName: productsById.get(productId)?.name || productId,
        quantitySold: sales.quantity,
        revenue: sales.revenue,
        cogs,
        grossProfit,
        grossMarginPct: sales.revenue > 0 ? (grossProfit / sales.revenue) * 100 : 0,
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);
}
