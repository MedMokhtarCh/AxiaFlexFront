import type { Request, Response } from 'express';
import {
  getTrainingProgressByUserId,
  upsertTrainingProgress,
} from '../services/trainingProgressService.js';

export async function getTrainingProgress(req: Request, res: Response) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    const row = await getTrainingProgressByUserId(userId);
    return res.json(row || null);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erreur serveur' });
  }
}

export async function putTrainingProgress(req: Request, res: Response) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    const saved = await upsertTrainingProgress(userId, req.body || {});
    return res.json(saved);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

