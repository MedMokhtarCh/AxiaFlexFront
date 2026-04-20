import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { StockLot } from '../entity/StockLot.js';

const toNumber = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const getRepo = (manager?: EntityManager) =>
  manager ? manager.getRepository(StockLot) : AppDataSource.getRepository(StockLot);

export async function createInboundLot(payload: {
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitCost?: number | null;
  batchNo?: string | null;
  expiryAt?: number | null;
  warehouseId?: string | null;
  branchId?: string | null;
  receivedAt?: number | null;
}, manager?: EntityManager) {
  const repo = getRepo(manager);
  const quantity = toNumber(payload.quantity);
  if (!payload.productId || quantity <= 0) return null;

  const lot = repo.create({
    productId: payload.productId,
    variantId: payload.variantId || null,
    warehouseId: payload.warehouseId || null,
    branchId: payload.branchId || null,
    batchNo: payload.batchNo || null,
    expiryAt: payload.expiryAt || null,
    receivedAt: payload.receivedAt || Date.now(),
    quantity,
    remainingQuantity: quantity,
    unitCost: payload.unitCost === null || payload.unitCost === undefined ? null : toNumber(payload.unitCost),
    createdAt: Date.now(),
  } as any);

  return repo.save(lot as any);
}

export async function consumeFifoLots(payload: {
  productId: string;
  variantId?: string | null;
  quantity: number;
  warehouseId?: string | null;
  branchId?: string | null;
  preferredBatchNo?: string | null;
}, manager?: EntityManager) {
  const repo = getRepo(manager);
  let remaining = toNumber(payload.quantity);
  if (remaining <= 0) return { totalCost: 0, averageUnitCost: null as number | null, consumedLots: [] as any[] };

  const lots = await repo.find({
    where: {
      productId: payload.productId,
      variantId: payload.variantId || null,
      warehouseId: payload.warehouseId || null,
      branchId: payload.branchId || null,
    } as any,
    order: {
      expiryAt: 'ASC',
      createdAt: 'ASC',
    } as any,
  });

  const eligibleLots = lots.filter((lot) => toNumber((lot as any).remainingQuantity) > 0);
  const wantedBatch = String(payload.preferredBatchNo || '').trim();
  const scopedLots = wantedBatch
    ? eligibleLots.filter((lot: any) => String((lot as any)?.batchNo || '').trim() === wantedBatch)
    : eligibleLots;
  const totalAvailable = scopedLots.reduce(
    (sum, lot: any) => sum + toNumber((lot as any).remainingQuantity),
    0,
  );
  if (totalAvailable < toNumber(payload.quantity)) {
    return {
      totalCost: 0,
      averageUnitCost: null as number | null,
      consumedLots: [] as any[],
      uncoveredQuantity: toNumber(payload.quantity),
    };
  }
  const consumedLots: any[] = [];
  let totalCost = 0;

  for (const lot of scopedLots) {
    if (remaining <= 0) break;
    const available = toNumber((lot as any).remainingQuantity);
    if (available <= 0) continue;
    const consumed = Math.min(available, remaining);
    const unitCost = (lot as any).unitCost === null || (lot as any).unitCost === undefined
      ? null
      : toNumber((lot as any).unitCost);

    (lot as any).remainingQuantity = available - consumed;
    await repo.save(lot as any);

    const lineCost = unitCost === null ? 0 : consumed * unitCost;
    totalCost += lineCost;
    consumedLots.push({
      lotId: (lot as any).id,
      batchNo: (lot as any).batchNo || null,
      expiryAt: (lot as any).expiryAt || null,
      quantity: consumed,
      unitCost,
      lineCost,
    });

    remaining -= consumed;
  }

  const consumedQty = toNumber(payload.quantity) - remaining;
  const averageUnitCost = consumedQty > 0 ? totalCost / consumedQty : null;
  return { totalCost, averageUnitCost, consumedLots, uncoveredQuantity: remaining };
}
