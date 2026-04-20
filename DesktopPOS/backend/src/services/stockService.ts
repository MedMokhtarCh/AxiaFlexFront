import { AppDataSource } from '../data-source.js';
import { Product } from '../entity/Product.js';
import { StockMovement } from '../entity/StockMovement.js';
import { emitEvent } from '../realtime.js';
import { EntityManager, In } from 'typeorm';
import { consumeFifoLots, createInboundLot } from './stockLotService.js';

const parseQuantity = (value: any) => {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

export async function listMovements() {
  const repo = AppDataSource.getRepository(StockMovement);
  const productRepo = AppDataSource.getRepository(Product);
  const rows = await repo.find({ order: { createdAt: 'DESC' } as any });
  if (rows.length === 0) return rows;

  const productIds = Array.from(new Set(rows.map((row: any) => row.productId).filter(Boolean)));
  const products = productIds.length > 0
    ? await productRepo.findBy({ id: In(productIds) } as any)
    : [];
  const byId = new Map(products.map((product) => [product.id, product.name]));

  return rows.map((row: any) => ({
    ...row,
    productName: byId.get(row.productId) || row.productId,
  }));
}

type ApplyStockMovementPayload = {
  productId: string;
  variantId?: string | null;
  type: 'IN' | 'OUT';
  quantity: number;
  note?: string | null;
  userName?: string | null;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  sourceProductId?: string | null;
  branchId?: string | null;
  warehouseId?: string | null;
  approvedBy?: string | null;
  allowNegativeStock?: boolean;
  unitCost?: number | null;
  batchNo?: string | null;
  expiryAt?: number | null;
};

export async function applyStockMovement(
  payload: ApplyStockMovementPayload,
  manager?: EntityManager,
) {
  const productRepo = manager ? manager.getRepository(Product) : AppDataSource.getRepository(Product);
  const movementRepo = manager ? manager.getRepository(StockMovement) : AppDataSource.getRepository(StockMovement);

  const product = await productRepo.findOneBy({ id: payload.productId } as any);
  if (!product) return null;

  const quantity = parseQuantity(payload.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  if (!product.manageStock) return null;

  const allowNegativeStock = Boolean(payload.allowNegativeStock);
  const delta = payload.type === 'IN' ? quantity : -quantity;
  const stockType = String((product as any)?.stockType || 'SIMPLE').toUpperCase();
  const usesLotConsumption =
    stockType === 'FIFO' || stockType === 'LOT' || stockType === 'SERIAL';

  let quantityBefore = 0;
  let quantityAfter = 0;
  let movementUnit = product.baseUnit || product.unit || 'piece';
  let movementUnitCost: number | null = null;
  let movementTotalCost: number | null = null;
  let movementCostMethod: string | null = null;
  let movementBatchNo: string | null = payload.batchNo || null;
  let movementExpiryAt: number | null = payload.expiryAt || null;

  if (payload.variantId) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const idx = variants.findIndex((v: any) => v.id === payload.variantId);
    if (idx < 0) return null;
    const current = Number(variants[idx]?.stock || 0);
    const next = current + delta;
    if (!allowNegativeStock && next < 0) return null;
    variants[idx] = { ...variants[idx], stock: next };
    product.variants = variants as any;
    quantityBefore = current;
    quantityAfter = next;
    movementUnit = variants[idx]?.unit || movementUnit;
  } else {
    const currentStock = Number(product.stock || 0);
    const nextStock = currentStock + delta;
    if (!allowNegativeStock && nextStock < 0) return null;
    product.stock = nextStock;
    quantityBefore = currentStock;
    quantityAfter = nextStock;
  }

  const savedProduct = await productRepo.save(product as any);

  if (payload.type === 'OUT' && usesLotConsumption) {
    const fifo = await consumeFifoLots({
      productId: payload.productId,
      variantId: payload.variantId || null,
      quantity,
      warehouseId: payload.warehouseId || null,
      branchId: payload.branchId || null,
      preferredBatchNo: payload.batchNo || null,
    }, manager);
    if (!allowNegativeStock && Number((fifo as any)?.uncoveredQuantity || 0) > 0) {
      return null;
    }

    movementTotalCost = Number.isFinite(Number(fifo.totalCost)) ? Number(fifo.totalCost) : 0;
    movementUnitCost = fifo.averageUnitCost === null ? null : Number(fifo.averageUnitCost);
    movementCostMethod = 'FIFO';
    if (Array.isArray(fifo.consumedLots) && fifo.consumedLots.length > 0) {
      movementBatchNo = fifo.consumedLots.map((line: any) => line.batchNo).filter(Boolean).join(', ') || movementBatchNo;
      movementExpiryAt = fifo.consumedLots[0]?.expiryAt || movementExpiryAt;
    }
  } else if (payload.type === 'IN') {
    const unitCost = payload.unitCost === null || payload.unitCost === undefined ? null : Number(payload.unitCost);
    movementUnitCost = Number.isFinite(Number(unitCost)) ? Number(unitCost) : null;
    movementTotalCost = movementUnitCost === null ? null : movementUnitCost * quantity;
    movementCostMethod = movementUnitCost === null ? null : 'INBOUND';

    await createInboundLot({
      productId: payload.productId,
      variantId: payload.variantId || null,
      quantity,
      unitCost: movementUnitCost,
      batchNo: payload.batchNo || null,
      expiryAt: payload.expiryAt || null,
      warehouseId: payload.warehouseId || null,
      branchId: payload.branchId || null,
      receivedAt: Date.now(),
    }, manager);
  }

  const movement = movementRepo.create({
    productId: payload.productId,
    variantId: payload.variantId || null,
    type: payload.type,
    quantity,
    unitCost: movementUnitCost,
    totalCost: movementTotalCost,
    costMethod: movementCostMethod,
    batchNo: movementBatchNo,
    expiryAt: movementExpiryAt,
    quantityBefore,
    quantityAfter,
    unit: movementUnit,
    reason: payload.reason || null,
    referenceType: payload.referenceType || null,
    referenceId: payload.referenceId || null,
    sourceProductId: payload.sourceProductId || null,
    branchId: payload.branchId || null,
    warehouseId: payload.warehouseId || null,
    note: payload.note || null,
    userName: payload.userName || null,
    approvedBy: payload.approvedBy || null,
    createdAt: Date.now(),
  } as any);
  const savedMovement = await movementRepo.save(movement as any);

  emitEvent('products:updated', savedProduct);
  emitEvent('stock:movement', { movement: savedMovement, product: savedProduct });

  return { movement: savedMovement, product: savedProduct };
}

export async function createMovement(payload: {
  productId: string;
  variantId?: string | null;
  type: 'IN' | 'OUT';
  quantity: number;
  note?: string | null;
  userName?: string | null;
  unitCost?: number | null;
  batchNo?: string | null;
  expiryAt?: number | null;
  warehouseId?: string | null;
  branchId?: string | null;
}) {
  return applyStockMovement({
    productId: payload.productId,
    variantId: payload.variantId,
    type: payload.type,
    quantity: payload.quantity,
    reason: 'MANUAL',
    note: payload.note || null,
    userName: payload.userName || null,
    unitCost: payload.unitCost,
    batchNo: payload.batchNo,
    expiryAt: payload.expiryAt,
    warehouseId: payload.warehouseId || null,
    branchId: payload.branchId || null,
  });
}
