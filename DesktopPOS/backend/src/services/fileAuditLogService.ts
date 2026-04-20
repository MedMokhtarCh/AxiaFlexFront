import { AppDataSource } from '../data-source.js';
import { AuditLogEntry } from '../entity/AuditLogEntry.js';
import crypto from 'crypto';

export type AuditLogKind = 'developer' | 'app-admin' | 'cash-closing';

type AuditProof = {
  algo: 'sha256';
  chain: 'audit-kind-date-v1';
  prevHash: string;
  hash: string;
};

export type AuditIntegrityReport = {
  ok: boolean;
  totalEntries: number;
  signedEntries: number;
  missingProofEntries: number;
  brokenEntries: number;
};

export type AuditIntegrityDayReport = AuditIntegrityReport & {
  dateKey: string;
};

export type AuditDayProofBundle = {
  kind: AuditLogKind;
  dateKey: string;
  generatedAt: string;
  totalEntries: number;
  integrity: AuditIntegrityReport;
  chainFinalHash: string;
  entriesDigest: string;
  proofDigest: string;
  entries: unknown[];
};

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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function buildProofInput(params: {
  kind: AuditLogKind;
  dateKey: string;
  createdAt: number;
  prevHash: string;
  payloadWithoutProof: unknown;
}) {
  return stableStringify({
    kind: params.kind,
    dateKey: params.dateKey,
    createdAt: params.createdAt,
    prevHash: params.prevHash,
    payload: params.payloadWithoutProof,
  });
}

function sha256(input: string) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function parseProof(payload: unknown): AuditProof | null {
  const p = payload as any;
  const proof = p?._audit;
  if (!proof || typeof proof !== 'object') return null;
  const algo = String(proof.algo || '').toLowerCase();
  const chain = String(proof.chain || '');
  const prevHash = String(proof.prevHash || '');
  const hash = String(proof.hash || '');
  if (algo !== 'sha256' || chain !== 'audit-kind-date-v1' || !hash) return null;
  return { algo: 'sha256', chain: 'audit-kind-date-v1', prevHash, hash };
}

export async function appendAuditLine(kind: AuditLogKind, entry: Record<string, unknown>) {
  const d = new Date();
  const dateKey = timestampFolders(d).dateFolder;
  const createdAt = d.getTime();
  const basePayload = {
    at: d.toISOString(),
    ...entry,
  };
  const repo = AppDataSource.getRepository(AuditLogEntry);
  const previous = await repo.findOne({
    where: { kind: kind as any, dateKey } as any,
    order: { createdAt: 'DESC' } as any,
  });
  const previousProof = parseProof(previous?.payload);
  const prevHash = previousProof?.hash || '';
  const hash = sha256(
    buildProofInput({
      kind,
      dateKey,
      createdAt,
      prevHash,
      payloadWithoutProof: basePayload,
    }),
  );
  const payload = {
    ...basePayload,
    _audit: {
      algo: 'sha256',
      chain: 'audit-kind-date-v1',
      prevHash,
      hash,
    } satisfies AuditProof,
  };
  const row = repo.create({
    kind,
    dateKey,
    createdAt,
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

export async function verifyAuditLogDay(
  kind: AuditLogKind,
  dateFolder: string,
): Promise<AuditIntegrityReport> {
  safeAuditRootSegment(dateFolder);
  const repo = AppDataSource.getRepository(AuditLogEntry);
  const rows = await repo.find({
    where: { kind: kind as any, dateKey: dateFolder } as any,
    order: { createdAt: 'ASC' } as any,
  });
  if (!rows.length) {
    return {
      ok: true,
      totalEntries: 0,
      signedEntries: 0,
      missingProofEntries: 0,
      brokenEntries: 0,
    };
  }
  let prevHash = '';
  let signedEntries = 0;
  let missingProofEntries = 0;
  let brokenEntries = 0;
  for (const row of rows as any[]) {
    const payload = row?.payload || {};
    const proof = parseProof(payload);
    if (!proof) {
      missingProofEntries += 1;
      continue;
    }
    signedEntries += 1;
    const payloadWithoutProof =
      payload && typeof payload === 'object'
        ? Object.fromEntries(
            Object.entries(payload as Record<string, unknown>).filter(([k]) => k !== '_audit'),
          )
        : payload;
    const expectedHash = sha256(
      buildProofInput({
        kind,
        dateKey: dateFolder,
        createdAt: Number(row.createdAt || 0),
        prevHash,
        payloadWithoutProof,
      }),
    );
    if (proof.prevHash !== prevHash || proof.hash !== expectedHash) {
      brokenEntries += 1;
    }
    prevHash = proof.hash;
  }
  return {
    ok: brokenEntries === 0 && missingProofEntries === 0,
    totalEntries: rows.length,
    signedEntries,
    missingProofEntries,
    brokenEntries,
  };
}

export async function verifyAuditLogsIntegrityReport(
  kind: AuditLogKind,
  options?: { fromDate?: string; toDate?: string },
) {
  const allDays = await listAuditDateFolders(kind);
  const fromDate = String(options?.fromDate || '').trim();
  const toDate = String(options?.toDate || '').trim();
  const days = allDays
    .filter((d) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate))
    .sort((a, b) => a.localeCompare(b));

  const dayReports: AuditIntegrityDayReport[] = [];
  let totalEntries = 0;
  let signedEntries = 0;
  let missingProofEntries = 0;
  let brokenEntries = 0;
  for (const day of days) {
    const report = await verifyAuditLogDay(kind, day);
    dayReports.push({ dateKey: day, ...report });
    totalEntries += report.totalEntries;
    signedEntries += report.signedEntries;
    missingProofEntries += report.missingProofEntries;
    brokenEntries += report.brokenEntries;
  }
  return {
    ok: brokenEntries === 0 && missingProofEntries === 0,
    kind,
    fromDate: fromDate || null,
    toDate: toDate || null,
    totalDays: days.length,
    totalEntries,
    signedEntries,
    missingProofEntries,
    brokenEntries,
    days: dayReports,
  };
}

export async function buildAuditLogDayProofBundle(
  kind: AuditLogKind,
  dateFolder: string,
): Promise<AuditDayProofBundle> {
  safeAuditRootSegment(dateFolder);
  const repo = AppDataSource.getRepository(AuditLogEntry);
  const rows = await repo.find({
    where: { kind: kind as any, dateKey: dateFolder } as any,
    order: { createdAt: 'ASC' } as any,
  });
  const integrity = await verifyAuditLogDay(kind, dateFolder);
  const entries = rows.map((r: any) => r.payload || {});
  const lastPayload = entries.length > 0 ? (entries[entries.length - 1] as any) : null;
  const lastProof = parseProof(lastPayload);
  const chainFinalHash = lastProof?.hash || '';
  const entriesDigest = sha256(stableStringify(entries));
  const generatedAt = new Date().toISOString();
  const proofDigest = sha256(
    stableStringify({
      kind,
      dateKey: dateFolder,
      generatedAt,
      totalEntries: entries.length,
      integrity,
      chainFinalHash,
      entriesDigest,
    }),
  );
  return {
    kind,
    dateKey: dateFolder,
    generatedAt,
    totalEntries: entries.length,
    integrity,
    chainFinalHash,
    entriesDigest,
    proofDigest,
    entries,
  };
}

export function getAuditLogsBaseDir() {
  return 'db://audit-log-entries';
}
