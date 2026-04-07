import { AppDataSource } from '../data-source.js';
import { Zone } from '../entity/Zone.js';
import { optionalPlanPercent } from '../utils/planLayout.js';

export async function listZones() {
  const repo = AppDataSource.getRepository(Zone);
  return repo.find();
}

export async function createZone(name: string) {
  const repo = AppDataSource.getRepository(Zone);
  const z = repo.create({ name } as any);
  return repo.save(z as any);
}

export async function updateZone(id: string, updates: Partial<Zone>) {
  const repo = AppDataSource.getRepository(Zone);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  Object.assign(existing, updates);
  return repo.save(existing as any);
}

type ZonePlanBody = {
  name?: string;
  planX?: unknown;
  planY?: unknown;
  planW?: unknown;
  planH?: unknown;
  planFill?: string | null;
};

export function normalizeZonePatch(body: ZonePlanBody): Partial<Zone> {
  const out: Partial<Zone> = {};
  if (body.name !== undefined) {
    const n = String(body.name ?? '').trim();
    if (n) (out as Zone).name = n;
  }
  if (body.planX !== undefined)
    (out as Zone).planX = optionalPlanPercent(body.planX) ?? null;
  if (body.planY !== undefined)
    (out as Zone).planY = optionalPlanPercent(body.planY) ?? null;
  if (body.planW !== undefined)
    (out as Zone).planW = optionalPlanPercent(body.planW) ?? null;
  if (body.planH !== undefined)
    (out as Zone).planH = optionalPlanPercent(body.planH) ?? null;
  if (body.planFill !== undefined) {
    (out as Zone).planFill =
      body.planFill === null || body.planFill === ''
        ? null
        : String(body.planFill);
  }
  return out;
}

export async function deleteZone(id: string) {
  const repo = AppDataSource.getRepository(Zone);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return false;
  await repo.remove(existing as any);
  return true;
}
