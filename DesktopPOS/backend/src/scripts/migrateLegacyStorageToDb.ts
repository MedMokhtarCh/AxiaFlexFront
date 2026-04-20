import fs from 'node:fs/promises';
import path from 'node:path';
import { AppDataSource } from '../data-source.js';
import { AuditLogEntry } from '../entity/AuditLogEntry.js';
import { PdfArchiveEntry } from '../entity/PdfArchiveEntry.js';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root: string, out: string[]) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) await walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
}

type CliOptions = {
  force: boolean;
  reportPath: string | null;
};

type FileReport = {
  file: string;
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: number;
};

type MigrationReport = {
  startedAt: string;
  finishedAt?: string;
  force: boolean;
  audit: {
    root: string;
    inserted: number;
    updated: number;
    skipped: number;
    invalid: number;
    errors: number;
    files: FileReport[];
  };
  pdf: {
    root: string;
    inserted: number;
    updated: number;
    skipped: number;
    invalid: number;
    errors: number;
    files: FileReport[];
  };
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let force = false;
  let reportPath: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i] || '').trim();
    if (a === '--force') force = true;
    if (a === '--report') {
      reportPath = String(args[i + 1] || '').trim() || null;
      i += 1;
    }
  }
  return { force, reportPath };
}

async function migrateAuditLogs(baseDir: string, options: CliOptions, report: MigrationReport) {
  const repo = AppDataSource.getRepository(AuditLogEntry);
  if (options.force) {
    await repo.clear();
    console.log('[migrate:legacy] --force actif: audit_log_entries vidé.');
  }
  const latestByKind = new Map<string, number>();
  for (const kind of ['developer', 'app-admin', 'cash-closing']) {
    const row = await repo
      .createQueryBuilder('a')
      .select('MAX(a.createdAt)', 'max')
      .where('a.kind = :kind', { kind })
      .getRawOne<{ max: string | null }>();
    const max = Number(row?.max || 0);
    latestByKind.set(kind, Number.isFinite(max) ? max : 0);
  }

  const kinds: Array<'developer' | 'app-admin'> = ['developer', 'app-admin'];

  for (const kind of kinds) {
    const kindDir = path.join(baseDir, kind);
    if (!(await pathExists(kindDir))) continue;
    const files: string[] = [];
    await walkFiles(kindDir, files);
    const jsonlFiles = files.filter((f) => f.toLowerCase().endsWith('.jsonl'));

    for (const file of jsonlFiles) {
      const fr: FileReport = {
        file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
        read: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        invalid: 0,
        errors: 0,
      };
      const raw = await fs.readFile(file, 'utf8');
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        fr.read += 1;
        try {
          const payload = JSON.parse(line) as Record<string, unknown>;
          const atRaw = String(payload.at || '');
          const at = atRaw ? new Date(atRaw) : new Date();
          const createdAt = Number.isFinite(at.getTime()) ? at.getTime() : Date.now();
          const latest = Number(latestByKind.get(kind) || 0);
          if (!options.force && latest > 0 && createdAt <= latest) {
            fr.skipped += 1;
            continue;
          }
          const dateKey = toDateKey(Number.isFinite(at.getTime()) ? at : new Date());
          await repo.save(
            repo.create({
              kind,
              dateKey,
              createdAt,
              payload,
            } as any),
          );
          fr.inserted += 1;
        } catch {
          fr.invalid += 1;
        }
      }
      report.audit.files.push(fr);
      report.audit.inserted += fr.inserted;
      report.audit.updated += fr.updated;
      report.audit.skipped += fr.skipped;
      report.audit.invalid += fr.invalid;
      report.audit.errors += fr.errors;
    }
  }

  const cashDir = path.join(baseDir, 'cash-closing');
  if (await pathExists(cashDir)) {
    const files: string[] = [];
    await walkFiles(cashDir, files);
    const jsonFiles = files.filter((f) => f.toLowerCase().endsWith('closing.json'));
    for (const file of jsonFiles) {
      const fr: FileReport = {
        file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
        read: 1,
        inserted: 0,
        updated: 0,
        skipped: 0,
        invalid: 0,
        errors: 0,
      };
      try {
        const raw = await fs.readFile(file, 'utf8');
        const payload = JSON.parse(raw) as Record<string, unknown>;
        const atRaw = String(payload.savedAt || payload.at || '');
        const at = atRaw ? new Date(atRaw) : new Date();
        const createdAt = Number.isFinite(at.getTime()) ? at.getTime() : Date.now();
        const latest = Number(latestByKind.get('cash-closing') || 0);
        if (!options.force && latest > 0 && createdAt <= latest) {
          fr.skipped += 1;
          report.audit.files.push(fr);
          report.audit.skipped += fr.skipped;
          continue;
        }
        const dateKey = toDateKey(Number.isFinite(at.getTime()) ? at : new Date());
        await repo.save(
          repo.create({
            kind: 'cash-closing',
            dateKey,
            createdAt,
            payload,
          } as any),
        );
        fr.inserted += 1;
      } catch {
        fr.invalid += 1;
      }
      report.audit.files.push(fr);
      report.audit.inserted += fr.inserted;
      report.audit.updated += fr.updated;
      report.audit.skipped += fr.skipped;
      report.audit.invalid += fr.invalid;
      report.audit.errors += fr.errors;
    }
  }
}

async function migratePdfArchives(baseDir: string, options: CliOptions, report: MigrationReport) {
  const repo = AppDataSource.getRepository(PdfArchiveEntry);
  if (options.force) {
    await repo.clear();
    console.log('[migrate:legacy] --force actif: pdf_archive_entries vidé.');
  }
  if (!(await pathExists(baseDir))) return;

  const files: string[] = [];
  await walkFiles(baseDir, files);
  const pdfs = files.filter((f) => f.toLowerCase().endsWith('.pdf'));

  for (const file of pdfs) {
    const fr: FileReport = {
      file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
      read: 1,
      inserted: 0,
      updated: 0,
      skipped: 0,
      invalid: 0,
      errors: 0,
    };
    try {
      const st = await fs.stat(file);
      const content = await fs.readFile(file);
      const rel = path.relative(baseDir, file).replace(/\\/g, '/').slice(0, 500);
      if (!rel) {
        fr.invalid += 1;
        report.pdf.files.push(fr);
        report.pdf.invalid += fr.invalid;
        continue;
      }
      const category = rel.split('/')[0] || 'misc';
      const updatedAt = Number(st.mtimeMs || Date.now());
      const existing = await repo.findOne({ where: { relativePath: rel } as any });
      if (!options.force && existing && Number((existing as any).updatedAt || 0) >= updatedAt) {
        fr.skipped += 1;
      } else if (existing) {
        Object.assign(existing, {
          category: category.slice(0, 120),
          name: path.basename(file),
          size: Number(st.size || content.length || 0),
          updatedAt,
          content,
        });
        await repo.save(existing as any);
        fr.updated += 1;
      } else {
        await repo.save(
          repo.create({
            category: category.slice(0, 120),
            relativePath: rel,
            name: path.basename(file),
            size: Number(st.size || content.length || 0),
            updatedAt,
            content,
          } as any),
        );
        fr.inserted += 1;
      }
    } catch {
      fr.errors += 1;
    }
    report.pdf.files.push(fr);
    report.pdf.inserted += fr.inserted;
    report.pdf.updated += fr.updated;
    report.pdf.skipped += fr.skipped;
    report.pdf.invalid += fr.invalid;
    report.pdf.errors += fr.errors;
  }
}

async function main() {
  const options = parseArgs();
  const backendRoot = process.cwd();
  const auditRoot = path.join(backendRoot, 'data', 'audit-logs');
  const pdfRoot = path.join(backendRoot, 'tmp', 'pdf-archives');
  const report: MigrationReport = {
    startedAt: new Date().toISOString(),
    force: options.force,
    audit: {
      root: auditRoot,
      inserted: 0,
      updated: 0,
      skipped: 0,
      invalid: 0,
      errors: 0,
      files: [],
    },
    pdf: {
      root: pdfRoot,
      inserted: 0,
      updated: 0,
      skipped: 0,
      invalid: 0,
      errors: 0,
      files: [],
    },
  };

  await AppDataSource.initialize();
  try {
    await migrateAuditLogs(auditRoot, options, report);
    await migratePdfArchives(pdfRoot, options, report);
    report.finishedAt = new Date().toISOString();
    const defaultReportPath = path.join(
      backendRoot,
      'tmp',
      'migration-reports',
      `legacy-storage-${Date.now()}.json`,
    );
    const finalReportPath = options.reportPath
      ? path.resolve(backendRoot, options.reportPath)
      : defaultReportPath;
    await fs.mkdir(path.dirname(finalReportPath), { recursive: true });
    await fs.writeFile(finalReportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[migrate:legacy] Audit insérés: ${report.audit.inserted}, ignorés: ${report.audit.skipped}, invalides: ${report.audit.invalid}, erreurs: ${report.audit.errors}`);
    console.log(`[migrate:legacy] PDF insérés: ${report.pdf.inserted}, mis à jour: ${report.pdf.updated}, ignorés: ${report.pdf.skipped}, erreurs: ${report.pdf.errors}`);
    console.log(`[migrate:legacy] Rapport: ${finalReportPath}`);
    console.log('[migrate:legacy] Migration terminée.');
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('[migrate:legacy] Échec:', err);
  process.exit(1);
});
