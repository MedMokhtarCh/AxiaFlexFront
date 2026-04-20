import { Request, Response } from 'express';
import {
  listTrainingModules,
  listTrainingProgressByUser,
  upsertTrainingProgress,
} from '../services/trainingService.js';

export async function getTrainingModules(_req: Request, res: Response) {
  try {
    const rows = await listTrainingModules();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function getTrainingProgress(req: Request, res: Response) {
  try {
    const userId = String(req.params.userId || '');
    const rows = await listTrainingProgressByUser(userId);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Invalid request' });
  }
}

export async function putTrainingProgress(req: Request, res: Response) {
  try {
    const userId = String(req.params.userId || '');
    const moduleId = String(req.params.moduleId || '');
    const out = await upsertTrainingProgress(userId, moduleId, req.body || {});
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Invalid request' });
  }
}
