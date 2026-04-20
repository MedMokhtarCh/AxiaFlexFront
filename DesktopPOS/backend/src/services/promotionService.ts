import { AppDataSource } from '../data-source.js';
import { Promotion } from '../entity/Promotion.js';

export async function listPromotions() {
  const repo = AppDataSource.getRepository(Promotion);
  return repo.find();
}

export async function createPromotion(payload: any) {
  const repo = AppDataSource.getRepository(Promotion);
  const p = repo.create(payload as any);
  return repo.save(p as any);
}

export async function updatePromotion(id: string, updates: any) {
  const repo = AppDataSource.getRepository(Promotion);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  Object.assign(existing, updates);
  return repo.save(existing as any);
}

export async function deletePromotion(id: string) {
  const repo = AppDataSource.getRepository(Promotion);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return false;
  await repo.remove(existing as any);
  return true;
}
