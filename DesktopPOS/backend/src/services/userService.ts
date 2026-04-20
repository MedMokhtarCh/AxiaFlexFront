import { AppDataSource } from '../data-source.js';
import { User } from '../entity/User.js';
import { assertUserQuota } from './saasLicenseService.js';

export async function listUsers() {
  const repo = AppDataSource.getRepository(User);
  const existing = await repo.find();
  if (existing.length === 0) {
    const seed = [
      { name: 'Ahmed (Admin)', role: 'ADMIN', pin: '1234', assignedZoneIds: [] },
      { name: 'Sami (Serveur)', role: 'SERVER', pin: '0000', assignedZoneIds: ['z1'] },
    ];
    const created = await repo.save(seed as any);
    return created;
  }
  return existing;
}

export async function createUser(payload: any) {
  await assertUserQuota();
  const repo = AppDataSource.getRepository(User);
  const u = repo.create(payload as any);
  return repo.save(u as any);
}

export async function updateUser(id: string, updates: any) {
  const repo = AppDataSource.getRepository(User);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  Object.assign(existing, updates);
  return repo.save(existing as any);
}

export async function deleteUser(id: string) {
  const repo = AppDataSource.getRepository(User);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return false;
  await repo.remove(existing as any);
  return true;
}
