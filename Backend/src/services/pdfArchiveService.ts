import fs from 'node:fs/promises';
import path from 'node:path';
import { AppDataSource } from '../data-source.js';
import { PdfArchiveEntry } from '../entity/PdfArchiveEntry.js';

function normalizeRelPath(value: string) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .slice(0, 500);
}

export async function savePdfArchiveFromFile(params: {
  category: string;
  relativePath: string;
  absolutePath: string;
}) {
  const repo = AppDataSource.getRepository(PdfArchiveEntry);
  const rel = normalizeRelPath(params.relativePath);
  if (!rel) return;
  const content = await fs.readFile(params.absolutePath);
  const st = await fs.stat(params.absolutePath);
  const existing = await repo.findOne({ where: { relativePath: rel } as any });
  const next = {
    category: String(params.category || 'misc').trim().slice(0, 120) || 'misc',
    relativePath: rel,
    name: path.basename(params.absolutePath),
    size: Number(st.size || content.length || 0),
    updatedAt: Number(st.mtimeMs || Date.now()),
    content,
  } as any;
  if (existing) {
    Object.assign(existing, next);
    await repo.save(existing as any);
    return;
  }
  await repo.save(repo.create(next));
}

export async function listPdfArchivesFromDb() {
  const repo = AppDataSource.getRepository(PdfArchiveEntry);
  const rows = await repo.find({ order: { updatedAt: 'DESC' } as any, take: 2000 });
  const byCategory = new Map<
    string,
    Array<{ name: string; relativePath: string; size: number; updatedAt: number }>
  >();
  for (const row of rows as any[]) {
    const list = byCategory.get(row.category) || [];
    list.push({
      name: String(row.name || ''),
      relativePath: String(row.relativePath || ''),
      size: Number(row.size || 0),
      updatedAt: Number(row.updatedAt || 0),
    });
    byCategory.set(row.category, list);
  }
  return Array.from(byCategory.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, files]) => ({
      category,
      path: `db://pdf-archives/${category}`,
      files: files.slice(0, 200),
    }));
}

export async function getPdfArchiveFileByRelativePath(relativePath: string) {
  const repo = AppDataSource.getRepository(PdfArchiveEntry);
  const rel = normalizeRelPath(relativePath);
  if (!rel) return null;
  return await repo.findOne({ where: { relativePath: rel } as any });
}
