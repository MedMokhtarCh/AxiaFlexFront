import { AppDataSource } from '../data-source.js';
import { Fund } from '../entity/Fund.js';
import { getSettings } from './settingsService.js';
import {
  getActiveFundSessionByShift,
  listFundMovements,
  openFundSession,
  closeFundSession,
  addFundMovement,
} from './fundSessionService.js';
import { resolveLatestOpenShift } from './shiftService.js';

export async function getSession() {
  const shift = await resolveLatestOpenShift();
  if (!shift) return { isOpen: false } as any;
  const fundSession = await getActiveFundSessionByShift(shift.id);
  if (!fundSession) return { isOpen: false } as any;
  const movements = await listFundMovements(fundSession.id);
  return {
    ...fundSession,
    isOpen: fundSession.status === 'OPEN',
    openingBalance: fundSession.openingBalance,
    cashSales: fundSession.cashSales,
    cardSales: fundSession.cardSales,
    totalSales: fundSession.totalSales,
    movements,
  } as any;
}

export async function openSession(initialFund?: number) {
  const settings = await getSettings();
  const shift = await resolveLatestOpenShift();
  if (!shift) throw new Error('No open shift');
  const fundRepo = AppDataSource.getRepository(Fund);
  const fund = settings?.terminalId
    ? await fundRepo.findOne({ where: { terminalId: settings.terminalId, isActive: true } as any })
    : await fundRepo.findOne({ where: { isActive: true } as any, order: { name: 'ASC' } as any });
  if (!fund) throw new Error('No active fund');

  return openFundSession({
    fundId: fund.id,
    shiftId: shift.id,
    cashierId: shift.cashierId || shift.userId,
    cashierName: shift.cashierName || shift.userName,
    openingBalance: Number(initialFund || 0),
  });
}

export async function closeSession(params?: {
  closingBalance?: number;
  notes?: string | null;
}) {
  const shift = await resolveLatestOpenShift();
  if (!shift) return null;
  const fundSession = await getActiveFundSessionByShift(shift.id);
  if (!fundSession) return null;
  const raw = params?.closingBalance;
  const closingBalance =
    raw !== undefined && raw !== null && Number.isFinite(Number(raw))
      ? Number(raw)
      : 0;
  return closeFundSession({
    sessionId: fundSession.id,
    closingBalance,
    notes: params?.notes ?? null,
  });
}

export async function addMovement(movement: any) {
  const shift = await resolveLatestOpenShift();
  if (!shift) throw new Error('No open shift');
  const fundSession = await getActiveFundSessionByShift(shift.id);
  if (!fundSession) throw new Error('No open fund session');
  return addFundMovement({
    sessionId: fundSession.id,
    type: movement?.type,
    amount: movement?.amount,
    reason: movement?.reason,
    userId: movement?.userId || null,
    userName: movement?.userName || null,
  });
}
