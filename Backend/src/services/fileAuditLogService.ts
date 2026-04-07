import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';

const AUDIT_ROOT = path.join(process.cwd(), 'data', 'audit-logs');

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
  const dir = path.join(AUDIT_ROOT, kind, dateFolder, hm);
  const file = path.join(dir, 'events.jsonl');
  return { dir, file, dateFolder, timeSegment: hm };
}

export async function appendAuditLine(kind: AuditLogKind, entry: Record<string, unknown>) {
  const { dir, file } = resolveAuditLogFile(kind);
  await fsp.mkdir(dir, { recursive: true });
  const line =
    JSON.stringify({
      at: new Date().toISOString(),
      ...entry,
    }) + '\n';
  await fsp.appendFile(file, line, 'utf8');
}

/**
 * Clôture caisse : un dossier par fermeture
 * audit-logs/cash-closing/YYYY-MM-DD/HH-mm-ss_{sessionId8}/closing.json
 */
export async function saveCashClosingSnapshot(payload: Record<string, unknown>) {
  const d = new Date();
  const { dateFolder, timeFolder } = timestampFolders(d);
  const sid = String(payload.sessionId ?? 'unknown').replace(/[^a-f0-9-]/gi, '').slice(0, 8) || 'noid';
  const folderName = `${timeFolder}_${sid}`;
  const dir = path.join(AUDIT_ROOT, 'cash-closing', dateFolder, folderName);
  await fsp.mkdir(dir, { recursive: true });
  const closingPath = path.join(dir, 'closing.json');
  const body = {
    savedAt: d.toISOString(),
    ...payload,
  };
  await fsp.writeFile(closingPath, JSON.stringify(body, null, 2), 'utf8');

  const dayDir = path.join(AUDIT_ROOT, 'cash-closing', dateFolder);
  await fsp.mkdir(dayDir, { recursive: true });
  const idxLine =
    JSON.stringify({
      at: d.toISOString(),
      folder: folderName,
      sessionId: payload.sessionId,
    }) + '\n';
  await fsp.appendFile(path.join(dayDir, 'index.jsonl'), idxLine, 'utf8');
}

function safeAuditRootSegment(p: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) throw new Error('Invalid date folder');
  return p;
}

/** Liste les jours (dossiers YYYY-MM-DD) pour un type de journal */
export async function listAuditDateFolders(kind: AuditLogKind): Promise<string[]> {
  const base = path.join(AUDIT_ROOT, kind);
  if (!fs.existsSync(base)) return [];
  const entries = await fsp.readdir(base, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
}

/** Contenu agrégé d’un jour (tous les .jsonl, parcours récursif) */
export async function readAuditLogDay(kind: AuditLogKind, dateFolder: string): Promise<string> {
  safeAuditRootSegment(dateFolder);
  const base = path.join(AUDIT_ROOT, kind, dateFolder);
  if (!fs.existsSync(base)) return '';
  const chunks: string[] = [];

  async function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        chunks.push(await fsp.readFile(p, 'utf8'));
      }
    }
  }

  await walk(base);
  return chunks.join('');
}

export function getAuditLogsBaseDir() {
  return AUDIT_ROOT;
}
