import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'crypto';

type AuditProof = {
  algo: 'sha256';
  chain: 'audit-kind-date-v1';
  prevHash: string;
  hash: string;
};

type AuditIntegrityReport = {
  ok: boolean;
  totalEntries: number;
  signedEntries: number;
  missingProofEntries: number;
  brokenEntries: number;
};

type AuditDayProofBundle = {
  kind: string;
  dateKey: string;
  generatedAt: string;
  totalEntries: number;
  integrity: AuditIntegrityReport;
  chainFinalHash: string;
  entriesDigest?: string;
  proofDigest: string;
  entries: unknown[];
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
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

function computeEntriesDigest(entries: unknown[]) {
  return sha256(stableStringify(entries));
}

function computeDigest(bundle: AuditDayProofBundle) {
  const entriesDigest = String(bundle.entriesDigest || '').trim();
  return sha256(
    stableStringify({
      kind: bundle.kind,
      dateKey: bundle.dateKey,
      generatedAt: bundle.generatedAt,
      totalEntries: bundle.totalEntries,
      integrity: bundle.integrity,
      chainFinalHash: bundle.chainFinalHash,
      ...(entriesDigest ? { entriesDigest } : {}),
    }),
  );
}

function toDateKey(value: string | undefined) {
  const v = String(value || '').trim();
  if (v) return v;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseArgs() {
  const userId = String(process.argv[2] || '').trim();
  if (!userId) {
    console.error(
      'Usage: npm run audit:export-verify-proof -- "<admin-user-id>" [date=YYYY-MM-DD] [kind=app-admin|developer|cash-closing] [baseUrl=http://localhost:3003] [outDir=./tmp/audit-proof]',
    );
    process.exit(1);
  }
  const date = toDateKey(process.argv[3]);
  const kindRaw = String(process.argv[4] || 'app-admin').trim().toLowerCase();
  const kind =
    kindRaw === 'developer' || kindRaw === 'cash-closing' || kindRaw === 'app-admin'
      ? kindRaw
      : 'app-admin';
  const baseUrl = String(process.argv[5] || 'http://localhost:3003')
    .trim()
    .replace(/\/+$/, '');
  const outDir = path.resolve(process.cwd(), String(process.argv[6] || './tmp/audit-proof').trim());
  return { userId, date, kind, baseUrl, outDir };
}

async function fetchProof(params: {
  userId: string;
  date: string;
  kind: string;
  baseUrl: string;
}) {
  const qs = new URLSearchParams({
    userId: params.userId,
    date: params.date,
    kind: params.kind,
  });
  const url = `${params.baseUrl}/pos/admin/logs/day-proof?${qs.toString()}`;
  const res = await fetch(url, { method: 'GET' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Export preuve impossible (${res.status}): ${String((body as any)?.error || res.statusText)}`,
    );
  }
  return body as AuditDayProofBundle;
}

function verifyBundle(bundle: AuditDayProofBundle) {
  const computedEntriesDigest = computeEntriesDigest(bundle.entries);
  const hasEntriesDigest = String(bundle.entriesDigest || '').trim().length > 0;
  const entriesDigestOk =
    !hasEntriesDigest || computedEntriesDigest === String(bundle.entriesDigest || '');
  const expectedDigest = computeDigest(bundle);
  const digestOk = expectedDigest === String(bundle.proofDigest || '');

  let prevHash = '';
  let signedEntries = 0;
  let missingProofEntries = 0;
  let brokenEntries = 0;
  for (const entry of bundle.entries) {
    const proof = parseProof(entry);
    if (!proof) {
      missingProofEntries += 1;
      continue;
    }
    signedEntries += 1;
    if (proof.prevHash !== prevHash) brokenEntries += 1;
    prevHash = proof.hash;
  }

  const computed: AuditIntegrityReport = {
    ok: brokenEntries === 0 && missingProofEntries === 0,
    totalEntries: bundle.entries.length,
    signedEntries,
    missingProofEntries,
    brokenEntries,
  };
  const chainFinalHashOk = String(bundle.chainFinalHash || '') === prevHash;
  const integrityMatches =
    Number(bundle.integrity?.totalEntries || 0) === computed.totalEntries &&
    Number(bundle.integrity?.signedEntries || 0) === computed.signedEntries &&
    Number(bundle.integrity?.missingProofEntries || 0) === computed.missingProofEntries &&
    Number(bundle.integrity?.brokenEntries || 0) === computed.brokenEntries &&
    Boolean(bundle.integrity?.ok) === computed.ok;
  const totalEntriesOk = Number(bundle.totalEntries || 0) === bundle.entries.length;
  const ok =
    digestOk &&
    entriesDigestOk &&
    chainFinalHashOk &&
    integrityMatches &&
    totalEntriesOk;
  return {
    ok,
    digestOk,
    entriesDigestOk,
    chainFinalHashOk,
    integrityMatches,
    totalEntriesOk,
  };
}

async function main() {
  const args = parseArgs();
  const bundle = await fetchProof(args);
  await fs.mkdir(args.outDir, { recursive: true });
  const filePath = path.join(args.outDir, `day-proof-${bundle.kind}-${bundle.dateKey}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  const check = verifyBundle(bundle);
  console.log('=== Export + Verification preuve audit ===');
  console.log(`Fichier exporte   : ${filePath}`);
  console.log(`Kind / Date       : ${bundle.kind} / ${bundle.dateKey}`);
  console.log(`Entries digest    : ${check.entriesDigestOk ? 'OK' : 'ALERTE'}`);
  console.log(`Digest            : ${check.digestOk ? 'OK' : 'ALERTE'}`);
  console.log(`Hash final chaine : ${check.chainFinalHashOk ? 'OK' : 'ALERTE'}`);
  console.log(`Integrity report  : ${check.integrityMatches ? 'OK' : 'ALERTE'}`);
  console.log(`Total entries     : ${check.totalEntriesOk ? 'OK' : 'ALERTE'}`);
  console.log(`RESULTAT          : ${check.ok ? 'PASS' : 'FAIL'}`);
  process.exit(check.ok ? 0 : 2);
}

main().catch((err: any) => {
  console.error(`Erreur export+verification preuve audit: ${err?.message || String(err)}`);
  process.exit(1);
});

