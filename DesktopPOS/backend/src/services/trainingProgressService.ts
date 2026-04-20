import { AppDataSource } from '../data-source.js';
import { TrainingProgress } from '../entity/TrainingProgress.js';

export type TrainingProgressPayload = {
  activeModuleId?: string;
  activeStep?: number;
  doneByModule?: Record<string, number[]>;
};

const repo = () => AppDataSource.getRepository(TrainingProgress);

export async function getTrainingProgressByUserId(userId: string) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  return await repo().findOne({ where: { userId: uid } });
}

export async function upsertTrainingProgress(
  userId: string,
  payload: TrainingProgressPayload,
) {
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('userId requis');

  const now = Date.now();
  const cleanPayload: TrainingProgressPayload = {
    activeModuleId:
      typeof payload?.activeModuleId === 'string'
        ? payload.activeModuleId
        : undefined,
    activeStep: Number.isFinite(Number(payload?.activeStep))
      ? Math.max(0, Number(payload?.activeStep || 0))
      : 0,
    doneByModule:
      payload?.doneByModule && typeof payload.doneByModule === 'object'
        ? payload.doneByModule
        : {},
  };

  const existing = await repo().findOne({ where: { userId: uid } });
  if (existing) {
    existing.payload = cleanPayload;
    existing.updatedAt = now;
    return await repo().save(existing);
  }

  const created = repo().create({
    userId: uid,
    payload: cleanPayload,
    updatedAt: now,
  });
  return await repo().save(created);
}

