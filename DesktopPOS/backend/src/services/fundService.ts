import { AppDataSource } from '../data-source.js';
import { Fund } from '../entity/Fund.js';

export async function listFunds() {
  const repo = AppDataSource.getRepository(Fund);
  const existing = await repo.find({ order: { name: 'ASC' } as any });
  if (existing.length > 0) return existing;
  const seed = repo.create({
    name: 'Caisse Principale',
    currency: 'DT',
    terminalId: null,
    isActive: true,
  } as any);
  const saved = await repo.save(seed as any);
  return [saved];
}

export async function createFund(payload: any) {
  const repo = AppDataSource.getRepository(Fund);
  const fund = repo.create({
    name: String(payload?.name || '').trim(),
    currency: String(payload?.currency || 'DT').trim() || 'DT',
    terminalId: payload?.terminalId ?? null,
    isActive: payload?.isActive ?? true,
  } as any);
  return repo.save(fund as any);
}

export async function updateFund(id: string, updates: any) {
  const repo = AppDataSource.getRepository(Fund);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  Object.assign(existing, updates);
  return repo.save(existing as any);
}

export async function deleteFund(id: string) {
  const repo = AppDataSource.getRepository(Fund);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return false;
  await repo.remove(existing as any);
  return true;
}
