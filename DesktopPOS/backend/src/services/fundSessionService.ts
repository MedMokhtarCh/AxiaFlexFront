import { AppDataSource } from '../data-source.js';
import { FundSession } from '../entity/FundSession.js';
import { FundMovement } from '../entity/FundMovement.js';
import { getSettings } from './settingsService.js';
import { listOpenShiftsForCurrentTerminal } from './terminalShiftQueries.js';
import { saveCashClosingSnapshot } from './fileAuditLogService.js';

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

export async function getActiveFundSessionByFund(fundId: string) {
  const repo = AppDataSource.getRepository(FundSession);
  return repo.findOne({
    where: { fundId, status: 'OPEN' } as any,
    order: { openedAt: 'DESC' } as any,
  });
}

export async function getActiveFundSessionByShift(shiftId: string) {
  const repo = AppDataSource.getRepository(FundSession);
  return repo.findOne({
    where: { shiftId, status: 'OPEN' } as any,
    order: { openedAt: 'DESC' } as any,
  });
}

export async function openFundSession(params: {
  fundId: string;
  shiftId: string;
  cashierId: string;
  cashierName: string;
  openingBalance: number;
  notes?: string | null;
}) {
  const settings = await getSettings();
  const terminalId = settings?.terminalId ? String(settings.terminalId) : null;
  const repo = AppDataSource.getRepository(FundSession);
  const existing = await repo.findOne({
    where: { fundId: params.fundId, status: 'OPEN' } as any,
    order: { openedAt: 'DESC' } as any,
  });
  if (existing) return existing;

  const session = repo.create({
    terminalId: terminalId || null,
    fundId: params.fundId,
    shiftId: params.shiftId,
    cashierId: params.cashierId,
    cashierName: params.cashierName,
    openedAt: Date.now(),
    openingBalance: parseNumeric(params.openingBalance),
    closingBalance: 0,
    totalSales: 0,
    cashSales: 0,
    cardSales: 0,
    status: 'OPEN',
    notes: params.notes || null,
  } as any);
  return repo.save(session as any);
}

export async function closeFundSession(params: {
  sessionId: string;
  closingBalance: number;
  notes?: string | null;
}) {
  const settings: any = await getSettings();
  if (settings.cashClosingMode === 'SHIFT_HANDOVER') {
    const openShifts = await listOpenShiftsForCurrentTerminal();
    // Plus d’une équipe encore ouverte : il faut réduire à une seule (clôtures / relève) avant la station.
    // Avec un seul shift ouvert, la station peut se clôturer puis ce dernier shift.
    if (openShifts.length > 1) {
      throw new Error(
        'Plusieurs shifts serveur sont encore ouverts sur ce poste. Terminez les relèves dans « Cloture Serveurs » jusqu’à ce qu’il ne reste qu’une équipe, puis clôturez la station.',
      );
    }
  }

  const repo = AppDataSource.getRepository(FundSession);
  const existing = await repo.findOneBy({ id: params.sessionId } as any);
  if (!existing) return null;
  existing.status = 'CLOSED';
  existing.closedAt = Date.now();
  existing.closingBalance = parseNumeric(params.closingBalance);
  existing.notes = params.notes || existing.notes || null;
  const saved = await repo.save(existing as any);
  try {
    const movements = await listFundMovements(params.sessionId);
    await saveCashClosingSnapshot({
      sessionId: saved.id,
      session: {
        id: saved.id,
        terminalId: saved.terminalId ?? null,
        fundId: saved.fundId,
        shiftId: saved.shiftId,
        cashierId: saved.cashierId,
        cashierName: saved.cashierName,
        openedAt: saved.openedAt,
        closedAt: saved.closedAt ?? null,
        openingBalance: Number(saved.openingBalance),
        closingBalance: Number(saved.closingBalance),
        totalSales: Number(saved.totalSales),
        cashSales: Number(saved.cashSales),
        cardSales: Number(saved.cardSales),
        status: saved.status,
        notes: saved.notes ?? null,
      },
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: Number(m.amount),
        reason: m.reason,
        createdAt: m.createdAt,
        userId: m.userId ?? null,
        userName: m.userName ?? null,
      })),
    });
  } catch (e) {
    console.error('[audit-logs] cash closing snapshot failed', e);
  }
  return saved;
}

export async function addFundMovement(params: {
  sessionId: string;
  type: string;
  amount: number;
  reason: string;
  userId?: string | null;
  userName?: string | null;
}) {
  const repo = AppDataSource.getRepository(FundMovement);
  const movement = repo.create({
    fundSessionId: params.sessionId,
    type: params.type,
    amount: parseNumeric(params.amount),
    reason: params.reason,
    createdAt: Date.now(),
    userId: params.userId || null,
    userName: params.userName || null,
  } as any);
  return repo.save(movement as any);
}

export async function listFundMovements(sessionId: string) {
  const repo = AppDataSource.getRepository(FundMovement);
  return repo.find({
    where: { fundSessionId: sessionId } as any,
    order: { createdAt: 'DESC' } as any,
  });
}

export async function updateFundSales(params: {
  shiftId?: string | null;
  cashDelta: number;
  cardDelta: number;
  totalDelta: number;
}) {
  if (!params.shiftId) return null;
  const repo = AppDataSource.getRepository(FundSession);
  const session = await getActiveFundSessionByShift(params.shiftId);
  if (!session) return null;
  session.totalSales = Number(session.totalSales) + params.totalDelta;
  session.cashSales = Number(session.cashSales) + params.cashDelta;
  session.cardSales = Number(session.cardSales) + params.cardDelta;
  return repo.save(session as any);
}

export async function listFundSessions(params: {
  from?: number;
  to?: number;
  fundId?: string;
  cashierId?: string;
  status?: string;
} = {}) {
  const repo = AppDataSource.getRepository(FundSession);
  let qb = repo.createQueryBuilder('fs');

  if (params.fundId) {
    qb = qb.andWhere('fs.fundId = :fundId', { fundId: params.fundId });
  }
  if (params.cashierId) {
    qb = qb.andWhere('fs.cashierId = :cashierId', {
      cashierId: params.cashierId,
    });
  }
  if (params.status) {
    qb = qb.andWhere('fs.status = :status', { status: params.status });
  }
  if (params.from) {
    qb = qb.andWhere('fs.openedAt >= :from', { from: params.from });
  }
  if (params.to) {
    qb = qb.andWhere('fs.openedAt <= :to', { to: params.to });
  }

  qb = qb.orderBy('fs.openedAt', 'DESC');

  return qb.getMany();
}
