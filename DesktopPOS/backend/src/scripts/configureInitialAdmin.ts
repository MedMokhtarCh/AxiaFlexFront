import { AppDataSource } from '../data-source.js';
import { User } from '../entity/User.js';

function parseArg(name: string, fallback = '') {
  const idx = process.argv.findIndex((arg) => arg === name);
  if (idx < 0) return fallback;
  return String(process.argv[idx + 1] || fallback).trim();
}

function normalizePin(raw: string) {
  const pin = String(raw || '').trim();
  if (!/^\d{4,8}$/.test(pin)) return '1234';
  return pin;
}

async function main() {
  const adminName = parseArg('--adminName', 'Admin').slice(0, 80) || 'Admin';
  const adminPin = normalizePin(parseArg('--adminPin', '1234'));

  await AppDataSource.initialize();
  try {
    const repo = AppDataSource.getRepository(User);
    const all = await repo.find();
    const existingAdmin = all.find((u: any) => String(u?.role || '').toUpperCase() === 'ADMIN') || null;
    if (existingAdmin) {
      (existingAdmin as any).name = adminName;
      (existingAdmin as any).pin = adminPin;
      await repo.save(existingAdmin as any);
      console.log('[admin:init] Admin mis a jour.');
      return;
    }

    const fallbackUser = all[0] || null;
    if (fallbackUser) {
      (fallbackUser as any).role = 'ADMIN';
      (fallbackUser as any).name = adminName;
      (fallbackUser as any).pin = adminPin;
      await repo.save(fallbackUser as any);
      console.log('[admin:init] Premier utilisateur promu ADMIN.');
      return;
    }

    const created = repo.create({
      name: adminName,
      role: 'ADMIN',
      pin: adminPin,
      assignedZoneIds: [],
    } as any);
    await repo.save(created as any);
    console.log('[admin:init] Admin cree.');
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('[admin:init] Echec:', error);
  process.exit(1);
});
