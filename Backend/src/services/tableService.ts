import { AppDataSource } from '../data-source.js';
import { Table } from '../entity/Table.js';
import { TableReservation } from '../entity/TableReservation.js';
import { randomUUID } from 'crypto';
import { emitEvent } from '../realtime.js';
import { optionalPlanPercent } from '../utils/planLayout.js';

const ensureTableToken = (table: Table) => {
  if (!table.token) table.token = randomUUID();
  if (!table.status) table.status = 'AVAILABLE';
};

const DEFAULT_RESERVATION_MINUTES = 60;

const toNumberOrNull = (value: any) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeReservationTimes = (table: Table) => {
  if (table.status === 'RESERVED') {
    if (!table.reservedAt) table.reservedAt = Date.now();
    if (!table.reservedUntil) {
      table.reservedUntil =
        Number(table.reservedAt) + DEFAULT_RESERVATION_MINUTES * 60 * 1000;
    }
  }
};

const closeActiveReservation = async (
  tableId: string,
  releasedAt: number,
) => {
  const repo = AppDataSource.getRepository(TableReservation);
  const active = await repo.findOne({
    where: { tableId, releasedAt: null } as any,
    order: { reservedAt: 'DESC' } as any,
  });
  if (!active) return;
  active.releasedAt = releasedAt;
  await repo.save(active as any);
};

const createReservationHistory = async (table: Table) => {
  const repo = AppDataSource.getRepository(TableReservation);
  const entry = repo.create({
    tableId: table.id,
    tableNumber: table.number,
    zoneId: table.zoneId,
    reservedBy: table.reservedBy || null,
    reservedAt: Number(table.reservedAt),
    reservedUntil: Number(table.reservedUntil),
  } as any);
  await repo.save(entry as any);
};

const expireReservations = async (tables: Table[]) => {
  const now = Date.now();
  const expired = tables.filter(
    (t) =>
      t.status === 'RESERVED' &&
      t.reservedUntil &&
      Number(t.reservedUntil) <= now,
  );
  if (expired.length === 0) return;
  expired.forEach((t) => {
    t.status = 'AVAILABLE';
    t.reservedBy = null;
    t.reservedAt = null;
    t.reservedUntil = null;
  });
  const repo = AppDataSource.getRepository(Table);
  await repo.save(expired as any);
  await Promise.all(
    expired.map((t) => closeActiveReservation(t.id, now)),
  );
};

export async function listTables() {
  const repo = AppDataSource.getRepository(Table);
  const tables = await repo.find();
  const needsUpdate = tables.filter((t) => !t.token || !t.status);
  if (needsUpdate.length > 0) {
    needsUpdate.forEach(ensureTableToken);
    await repo.save(needsUpdate as any);
  }
  const missingReservationTimes = tables.filter(
    (t) => t.status === 'RESERVED' && (!t.reservedAt || !t.reservedUntil),
  );
  if (missingReservationTimes.length > 0) {
    missingReservationTimes.forEach(normalizeReservationTimes);
    await repo.save(missingReservationTimes as any);
  }
  await expireReservations(tables);
  return tables;
}

type TablePlanInput = Partial<
  Pick<Table, 'planX' | 'planY' | 'planW' | 'planH' | 'planShape'>
>;

const normalizeTablePlan = (raw: TablePlanInput | undefined) => {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  if (raw.planX !== undefined)
    out.planX = optionalPlanPercent(raw.planX) ?? null;
  if (raw.planY !== undefined)
    out.planY = optionalPlanPercent(raw.planY) ?? null;
  if (raw.planW !== undefined)
    out.planW = optionalPlanPercent(raw.planW) ?? null;
  if (raw.planH !== undefined)
    out.planH = optionalPlanPercent(raw.planH) ?? null;
  if (raw.planShape !== undefined) {
    out.planShape =
      raw.planShape === 'square' || raw.planShape === 'rect'
        ? raw.planShape
        : null;
  }
  return out;
};

export async function createTable(
  number: string,
  zoneId: string,
  capacity: number,
  plan?: TablePlanInput,
) {
  const repo = AppDataSource.getRepository(Table);
  const planNorm = normalizeTablePlan(plan);
  const t = repo.create({
    number,
    zoneId,
    capacity,
    status: 'AVAILABLE',
    token: randomUUID(),
    ...planNorm,
  } as any);
  const saved = await repo.save(t as any);
  emitEvent('tables:updated', saved);
  return saved;
}

export async function updateTable(id: string, updates: Partial<Table>) {
  const repo = AppDataSource.getRepository(Table);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  const next = {
    ...updates,
    reservedAt: toNumberOrNull((updates as any).reservedAt),
    reservedUntil: toNumberOrNull((updates as any).reservedUntil),
  } as any;
  const wasReserved = existing.status === 'RESERVED';
  const willBeReserved = next.status === 'RESERVED';
  Object.assign(existing, next);
  ensureTableToken(existing);
  normalizeReservationTimes(existing);
  if (willBeReserved && !wasReserved) {
    try {
      await createReservationHistory(existing);
    } catch (error) {
      console.error('Failed to create reservation history', error);
    }
  }
  if (!willBeReserved && wasReserved) {
    try {
      await closeActiveReservation(existing.id, Date.now());
    } catch (error) {
      console.error('Failed to close reservation history', error);
    }
    existing.reservedBy = null;
    existing.reservedAt = null;
    existing.reservedUntil = null;
  }
  const saved = await repo.save(existing as any);
  emitEvent('tables:updated', saved);
  return saved;
}

export async function deleteTable(id: string) {
  const repo = AppDataSource.getRepository(Table);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return false;
  await repo.remove(existing as any);
  emitEvent('tables:deleted', { id });
  return true;
}

export async function listReservations() {
  const repo = AppDataSource.getRepository(TableReservation);
  return repo.find({ order: { reservedAt: 'DESC' } as any });
}
