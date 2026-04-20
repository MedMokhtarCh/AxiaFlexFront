import { Request, Response } from 'express';
import { AppDataSource } from '../data-source.js';
import { User } from '../entity/User.js';
import * as fileLog from '../services/fileAuditLogService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

async function requireAdmin(req: Request, res: Response): Promise<User | null> {
  const userId = String(
    (req.method === 'GET' ? (req.query as any).userId : (req.body || {}).userId) || '',
  ).trim();
  if (!userId) {
    res.status(400).json({ error: 'userId requis' });
    return null;
  }
  const user = await AppDataSource.getRepository(User).findOneBy({ id: userId } as any);
  if (!user || String(user.role || '').toUpperCase() !== 'ADMIN') {
    res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    return null;
  }
  return user;
}

export async function listAppAdminLogs(req: Request, res: Response) {
  try {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const date = String((req.query as any).date || '').trim();
    if (date) {
      const content = await fileLog.readAuditLogDay('app-admin', date);
      const integrity = await fileLog.verifyAuditLogDay('app-admin', date);
      return res.json({ date, content, integrity });
    }
    const days = await fileLog.listAuditDateFolders('app-admin');
    return res.json({ days });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
}

export async function appendAppAdminLog(req: Request, res: Response) {
  try {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const message = String((req.body || {}).message || '').trim();
    if (!message) return res.status(400).json({ error: 'message requis' });
    (req as any).auditActorId = user.id;
    (req as any).auditActorName = user.name;
    await logAppAdminAction(req, 'insert', 'admin_journal_note', null, {
      message,
      meta: (req.body || {}).meta,
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
}

export async function getAppAdminLogsIntegrityReport(req: Request, res: Response) {
  try {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const kindRaw = String((req.query as any).kind || 'app-admin')
      .trim()
      .toLowerCase();
    const kind =
      kindRaw === 'developer' || kindRaw === 'cash-closing' || kindRaw === 'app-admin'
        ? kindRaw
        : 'app-admin';
    const fromDate = String((req.query as any).fromDate || '').trim();
    const toDate = String((req.query as any).toDate || '').trim();
    const report = await fileLog.verifyAuditLogsIntegrityReport(kind as any, {
      fromDate,
      toDate,
    });
    return res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
}

export async function getAppAdminLogDayProof(req: Request, res: Response) {
  try {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const date = String((req.query as any).date || '').trim();
    if (!date) return res.status(400).json({ error: 'date requis (YYYY-MM-DD)' });
    const kindRaw = String((req.query as any).kind || 'app-admin')
      .trim()
      .toLowerCase();
    const kind =
      kindRaw === 'developer' || kindRaw === 'cash-closing' || kindRaw === 'app-admin'
        ? kindRaw
        : 'app-admin';
    const proof = await fileLog.buildAuditLogDayProofBundle(kind as any, date);
    return res.json(proof);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
}
