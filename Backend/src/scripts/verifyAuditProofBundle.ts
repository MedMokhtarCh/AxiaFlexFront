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

async function main() {
  const rawPath = String(process.argv[2] || '').trim();
  if (!rawPath) {
    console.error('Usage: npm run audit:verify-proof -- "<path-to-day-proof.json>"');
    process.exit(1);
  }
  const filePath = path.resolve(process.cwd(), rawPath);
  const content = await fs.readFile(filePath, 'utf8');
  const bundle = JSON.parse(content) as AuditDayProofBundle;

  if (!bundle || typeof bundle !== 'object' || !Array.isArray(bundle.entries)) {
    throw new Error('Format de bundle invalide.');
  }

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

  console.log('=== Verification preuve audit exportee ===');
  console.log(`Fichier           : ${filePath}`);
  console.log(`Kind / Date       : ${bundle.kind} / ${bundle.dateKey}`);
  console.log(`Entries           : ${bundle.entries.length}`);
  console.log(`Entries digest    : ${entriesDigestOk ? 'OK' : 'ALERTE'}`);
  console.log(`Digest            : ${digestOk ? 'OK' : 'ALERTE'}`);
  console.log(`Hash final chaine : ${chainFinalHashOk ? 'OK' : 'ALERTE'}`);
  console.log(`Integrity report  : ${integrityMatches ? 'OK' : 'ALERTE'}`);
  console.log(`Total entries     : ${totalEntriesOk ? 'OK' : 'ALERTE'}`);

  const ok =
    digestOk &&
    entriesDigestOk &&
    chainFinalHashOk &&
    integrityMatches &&
    totalEntriesOk;
  if (ok) {
    console.log('RESULTAT          : PASS');
    process.exit(0);
  }
  console.log('RESULTAT          : FAIL');
  process.exit(2);
}

main().catch((err: any) => {
  console.error(`Erreur verification preuve audit: ${err?.message || String(err)}`);
  process.exit(1);
});

