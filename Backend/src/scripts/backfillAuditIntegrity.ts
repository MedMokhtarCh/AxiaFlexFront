import crypto from 'crypto';
import { AppDataSource } from '../data-source.js';
import { AuditLogEntry } from '../entity/AuditLogEntry.js';

type AuditKind = 'developer' | 'app-admin' | 'cash-closing';

const TARGET_KINDS: AuditKind[] = ['developer', 'app-admin', 'cash-closing'];

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

function proofInput(params: {
  kind: AuditKind;
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

async function run() {
  await AppDataSource.initialize();
  try {
    const repo = AppDataSource.getRepository(AuditLogEntry);
    let totalUpdated = 0;

    for (const kind of TARGET_KINDS) {
      const dateRows = await repo
        .createQueryBuilder('a')
        .select('a.dateKey', 'dateKey')
        .where('a.kind = :kind', { kind })
        .groupBy('a.dateKey')
        .orderBy('a.dateKey', 'ASC')
        .getRawMany<{ dateKey: string }>();

      for (const { dateKey } of dateRows) {
        const rows = await repo.find({
          where: { kind: kind as any, dateKey } as any,
          order: { createdAt: 'ASC' } as any,
        });
        let prevHash = '';
        for (const row of rows as any[]) {
          const payload = (row?.payload && typeof row.payload === 'object'
            ? row.payload
            : {}) as Record<string, unknown>;
          const payloadWithoutProof = Object.fromEntries(
            Object.entries(payload).filter(([k]) => k !== '_audit'),
          );
          const hash = sha256(
            proofInput({
              kind,
              dateKey: String(dateKey || ''),
              createdAt: Number(row.createdAt || 0),
              prevHash,
              payloadWithoutProof,
            }),
          );
          row.payload = {
            ...payloadWithoutProof,
            _audit: {
              algo: 'sha256',
              chain: 'audit-kind-date-v1',
              prevHash,
              hash,
            },
          };
          prevHash = hash;
          totalUpdated += 1;
        }
        if (rows.length > 0) await repo.save(rows as any);
      }
    }

    console.log(`[audit-backfill] done rows_updated=${totalUpdated}`);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error('[audit-backfill] failed:', error);
  process.exit(1);
});

