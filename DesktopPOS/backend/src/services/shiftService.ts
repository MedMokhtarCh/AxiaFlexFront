import { AppDataSource } from '../data-source.js';
import { Shift } from '../entity/Shift.js';
import { Order } from '../entity/Order.js';
import { FundSession } from '../entity/FundSession.js';
import { In, IsNull } from 'typeorm';
import { getActiveFundSessionByShift } from './fundSessionService.js';
import { getSettings } from './settingsService.js';
import { listOpenShiftsForCurrentTerminal } from './terminalShiftQueries.js';

const ACTIVE_ORDER_STATUSES = ['PENDING', 'PREPARING', 'READY', 'DELIVERED', 'PARTIAL'];

const parseNumeric = (value: any) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9,.-]/g, '');
  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount = (cleaned.match(/\./g) || []).length;
  let normalized = cleaned;
  if (commaCount > 0) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (dotCount > 1) {
    normalized = normalized.replace(/\./g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Dernier shift OPEN pour ce poste, avec repli si terminalId BDD ≠ paramètres
 * (shifts anciens en terminalId NULL après ajout d’un ID en settings, etc.).
 */
export async function resolveLatestOpenShift(): Promise<Shift | null> {
  const settings = await getSettings();
  const tidRaw = settings?.terminalId ? String(settings.terminalId).trim() : '';
  const repo = AppDataSource.getRepository(Shift);

  let shift = await repo.findOne({
    where: { status: 'OPEN', terminalId: tidRaw ? tidRaw : IsNull() } as any,
    order: { openedAt: 'DESC' } as any,
  });
  if (shift) return shift;

  if (tidRaw) {
    shift = await repo.findOne({
      where: { status: 'OPEN', terminalId: IsNull() } as any,
      order: { openedAt: 'DESC' } as any,
    });
    if (shift) return shift;
  }

  return repo.findOne({
    where: { status: 'OPEN' } as any,
    order: { openedAt: 'DESC' } as any,
  });
}

export async function getActiveShift(userId: string) {
  const settings = await getSettings();
  const tidRaw = settings?.terminalId ? String(settings.terminalId).trim() : '';
  const repo = AppDataSource.getRepository(Shift);

  const findForUser = (terminalFilter: any) =>
    repo.findOne({
      where: [
        { userId, status: 'OPEN', terminalId: terminalFilter } as any,
        { cashierId: userId, status: 'OPEN', terminalId: terminalFilter } as any,
      ] as any,
      order: { openedAt: 'DESC' } as any,
    });

  let shift = await findForUser(tidRaw ? tidRaw : null);
  if (shift) return shift;

  if (tidRaw) {
    shift = await findForUser(IsNull());
    if (shift) return shift;
  }

  return repo.findOne({
    where: [
      { userId, status: 'OPEN' } as any,
      { cashierId: userId, status: 'OPEN' } as any,
    ] as any,
    order: { openedAt: 'DESC' } as any,
  });
}

export async function getLatestOpenShift() {
  return resolveLatestOpenShift();
}

export async function openShift(params: {
  cashierId: string;
  cashierName: string;
  fundId?: string | null;
  fundName?: string | null;
  openedById?: string | null;
  openedByName?: string | null;
  role?: string | null;
  notes?: string | null;
  openingFund?: number | null;
}) {
  const existing = await getActiveShift(params.cashierId);
  if (existing) return existing;

  const settings = await getSettings();
  const terminalId = settings?.terminalId ? String(settings.terminalId) : null;
  const repo = AppDataSource.getRepository(Shift);
  const shift = repo.create({
    terminalId: terminalId || null,
    userId: params.cashierId,
    userName: params.cashierName,
    role: params.role || 'CASHIER',
    openedById: params.openedById || null,
    openedByName: params.openedByName || null,
    cashierId: params.cashierId,
    cashierName: params.cashierName,
    fundId: params.fundId || null,
    fundName: params.fundName || null,
    openedAt: Date.now(),
    openingFund: parseNumeric(params.openingFund),
    closingFund: 0,
    notes: params.notes || null,
    status: 'OPEN',
  } as any);
  return repo.save(shift as any);
}

export async function closeShift(params: {
  shiftId?: string | null;
  userId?: string | null;
  closingFund?: number;
  notes?: string | null;
}) {
  const repo = AppDataSource.getRepository(Shift);
  const shiftId = params.shiftId || null;
  const shift = shiftId
    ? await repo.findOneBy({ id: shiftId } as any)
    : params.userId
      ? await getActiveShift(params.userId)
      : null;
  if (!shift) return null;

  const fundOnShift = await getActiveFundSessionByShift(shift.id);
  if (fundOnShift) {
    const otherOpen = (await listOpenShiftsForCurrentTerminal()).filter(
      (s) => s.id !== shift.id && String(s.status || '').toUpperCase() === 'OPEN',
    );
    if (otherOpen.length > 0) {
      const target = [...otherOpen].sort(
        (a, b) => Number(b.openedAt || 0) - Number(a.openedAt || 0),
      )[0];
      const fsRepo = AppDataSource.getRepository(FundSession);
      fundOnShift.shiftId = target.id;
      fundOnShift.cashierId = String(target.cashierId || target.userId || fundOnShift.cashierId);
      fundOnShift.cashierName = String(
        target.cashierName || target.userName || fundOnShift.cashierName,
      );
      await fsRepo.save(fundOnShift as any);
    } else {
      throw new Error(
        'Dernière équipe : la caisse est encore ouverte sur ce shift. Allez dans Shift & Caisse et utilisez « Clôturer Station », puis vous pourrez clôturer ce shift ici. (Si une équipe suivante doit reprendre la caisse sans la fermer, ouvrez son shift avant de clôturer le vôtre.)',
      );
    }
  }

  const orderRepo = AppDataSource.getRepository(Order);
  const activeOrders = await orderRepo.find({
    where: {
      shiftId: shift.id,
      status: In(ACTIVE_ORDER_STATUSES) as any,
    } as any,
  });
  if (activeOrders.length > 0) {
    throw new Error('Active orders still open');
  }

  shift.closedAt = Date.now();
  shift.closingFund = parseNumeric(params.closingFund);
  shift.notes = params.notes || shift.notes || null;
  shift.status = 'CLOSED';
  return repo.save(shift as any);
}

export async function listShifts() {
  const repo = AppDataSource.getRepository(Shift);
  return repo.find({ order: { openedAt: 'DESC' } as any });
}

export async function listShiftSummaries() {
  const shifts = await listShifts();
  const orderRepo = AppDataSource.getRepository(Order);
  const summaries = [] as any[];

  for (const shift of shifts) {
    const orders = await orderRepo.find({
      where: { shiftId: shift.id } as any,
    });
    let totalSales = 0;
    let cashSales = 0;
    let cardSales = 0;
    let orderCount = 0;
    let paidOrders = 0;
    let unpaidOrders = 0;
    const tableSet = new Set<string>();

    orders.forEach((order: any) => {
      orderCount += 1;
      if (order.tableNumber) tableSet.add(String(order.tableNumber));
      const payments = Array.isArray(order.payments) ? order.payments : [];
      let paymentsTotal = 0;
      payments.forEach((payment: any) => {
        const amount = parseNumeric(payment.amount);
        paymentsTotal += amount;
        totalSales += amount;
        if (payment.method === 'CASH') cashSales += amount;
        if (payment.method === 'BANK_CARD') cardSales += amount;
      });
      const orderTotal = parseNumeric(order.total);
      const isPaid =
        String(order.status).toUpperCase() === 'COMPLETED' ||
        (orderTotal > 0 && paymentsTotal >= orderTotal);
      if (isPaid) paidOrders += 1;
      else unpaidOrders += 1;
    });

    summaries.push({
      shift,
      totals: {
        totalSales,
        cashSales,
        cardSales,
        orderCount,
        paidOrders,
        unpaidOrders,
        tableCount: tableSet.size,
      },
    });
  }

  return summaries;
}
