import { AppDataSource } from '../data-source.js';
import { AuditLogEntry } from '../entity/AuditLogEntry.js';

export type AuditLogKind = 'developer' | 'app-admin';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD et HH-mm-ss (heure locale serveur) */
export function timestampFolders(d = new Date()) {
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  const s = pad2(d.getSeconds());
  return {
    dateFolder: `${y}-${mo}-${day}`,
    timeFolder: `${h}-${min}-${s}`,
  };
}

/**
 * Journaux développeur / admin appli :
 * audit-logs/{kind}/YYYY-MM-DD/HH-mm/events.jsonl
 * (un sous-dossier par minute dans la journée, fichier append)
 */
export function resolveAuditLogFile(kind: AuditLogKind, d = new Date()) {
  const { dateFolder, timeFolder } = timestampFolders(d);
  const hm = timeFolder.slice(0, 5);
  return {
    dir: `db://audit-log-entries/${kind}/${dateFolder}/${hm}`,
    file: 'db://audit-log-entries/events.jsonl',
    dateFolder,
    timeSegment: hm,
  };
}

export async function appendAuditLine(kind: AuditLogKind, entry: Record<string, unknown>) {
  const d = new Date();
  const dateKey = timestampFolders(d).dateFolder;
  const payload = {
    at: d.toISOString(),
    ...entry,
  };
  const repo = AppDataSource.getRepository(AuditLogEntry);
  const row = repo.create({
    kind,
    dateKey,
    createdAt: d.getTime(),
    payload,
  } as any);
  await repo.save(row as any);
}

/**
 * Clôture caisse : un dossier par fermeture
 * audit-logs/cash-closing/YYYY-MM-DD/HH-mm-ss_{sessionId8}/closing.json
 */
export async function saveCashClosingSnapshot(payload: Record<string, unknown>) {
  const d = new Date();
  const { dateFolder } = timestampFolders(d);
  const body = {
    savedAt: d.toISOString(),
    ...payload,
  };
  const repo = AppDataSource.getRepository(AuditLogEntry);
  const row = repo.create({
    kind: 'cash-closing',
    dateKey: dateFolder,
    createdAt: d.getTime(),
    payload: body,
  } as any);
  await repo.save(row as any);
}

function safeAuditRootSegment(p: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) throw new Error('Invalid date folder');
  return p;
}

/** Liste les jours (dossiers YYYY-MM-DD) pour un type de journal */
export async function listAuditDateFolders(kind: AuditLogKind): Promise<string[]> {
  const repo = AppDataSource.getRepository(AuditLogEntry);
  const rows = await repo
    .createQueryBuilder('a')
    .select('a.dateKey', 'dateKey')
    .where('a.kind = :kind', { kind })
    .groupBy('a.dateKey')
    .orderBy('a.dateKey', 'DESC')
    .getRawMany<{ dateKey: string }>();
  return rows.map((r) => String(r.dateKey || '')).filter(Boolean);
}

/** Contenu agrégé d’un jour (tous les .jsonl, parcours récursif) */
export async function readAuditLogDay(kind: AuditLogKind, dateFolder: string): Promise<string> {
  safeAuditRootSegment(dateFolder);
  const repo = AppDataSource.getRepository(AuditLogEntry);
  const rows = await repo.find({
    where: {
      kind: kind as any,
      dateKey: dateFolder,
    } as any,
    order: { createdAt: 'ASC' } as any,
  });
  if (!rows.length) return '';
  return rows
    .map((r: any) => JSON.stringify(r.payload || {}) + '\n')
    .join('');
}

export function getAuditLogsBaseDir() {
  return 'db://audit-log-entries';
}
