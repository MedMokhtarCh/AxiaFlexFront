import { Request, Response } from 'express';
import * as settingsService from '../services/settingsService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { AppDataSource } from '../data-source.js';
import { User } from '../entity/User.js';
import {
  getPdfArchiveFileByRelativePath,
  listPdfArchivesFromDb,
} from '../services/pdfArchiveService.js';

const uploadsDir = path.join(process.cwd(), 'uploads', 'logos');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (err: Error | null, destination: string) => void) =>
    cb(null, uploadsDir),
  filename: (_req: Request, file: Express.Multer.File, cb: (err: Error | null, filename: string) => void) => {
    const ext = path.extname(file.originalname || '') || '.png';
    const name = `logo-${Date.now()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({ storage });

async function requireAdminFromQuery(req: Request, res: Response): Promise<User | null> {
  const userId = String((req.query as any)?.userId || '').trim();
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

export async function getSettings(req: Request, res: Response) {
  try {
    const settings = await settingsService.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function patchSettings(req: Request, res: Response) {
  try {
    const body = req.body || {};
    const saved = await settingsService.saveSettings(body);
    try {
      const keys = Object.keys(body);
      if (keys.length) {
        await logAppAdminAction(req, 'update', 'settings', null, { keysChanged: keys });
      }
    } catch (e) {
      console.error('[audit-logs] app-admin settings log failed', e);
    }
    res.json(saved);
  } catch (err) {
    console.error('patchSettings error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export const uploadLogo = [
  upload.single('logo'),
  async (req: Request, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: 'No file' });
      const logoUrl = `/uploads/logos/${file.filename}`;
      const saved = await settingsService.saveSettings({ logoUrl });
      void logAppAdminAction(req, 'update', 'settings_logo', null, { logoUrl });
      res.json(saved);
    } catch (err) {
      console.error('uploadLogo error:', err);
      res.status(500).json({ error: (err as any)?.message || 'Server error' });
    }
  },
];

export async function listPdfArchives(_req: Request, res: Response) {
  try {
    const out = await listPdfArchivesFromDb();
    res.json({
      baseDir: 'db://pdf-archives',
      categories: out,
    });
  } catch (err) {
    console.error('listPdfArchives error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function downloadPdfArchiveFile(req: Request, res: Response) {
  try {
    const rel = String(req.query.path || '').trim();
    if (!rel) return res.status(400).json({ error: 'Missing file path' });
    const row = await getPdfArchiveFileByRelativePath(rel);
    if (!row) return res.status(404).json({ error: 'File not found' });
    const fileName = String((row as any).name || 'archive.pdf');
    const content = (row as any).content as Buffer;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(content);
  } catch (err) {
    console.error('downloadPdfArchiveFile error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function listMigrationReports(req: Request, res: Response) {
  try {
    const user = await requireAdminFromQuery(req, res);
    if (!user) return;
    const reportsDir = path.join(process.cwd(), 'tmp', 'migration-reports');
    await fsp.mkdir(reportsDir, { recursive: true });
    const entries = await fsp.readdir(reportsDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
        .map(async (e) => {
          const filePath = path.join(reportsDir, e.name);
          const st = await fsp.stat(filePath);
          return {
            name: e.name,
            path: filePath,
            size: Number(st.size || 0),
            updatedAt: Number(st.mtimeMs || Date.now()),
          };
        }),
    );
    files.sort((a, b) => b.updatedAt - a.updatedAt);
    res.json({
      reportsDir,
      reports: files.slice(0, 200),
    });
  } catch (err) {
    console.error('listMigrationReports error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function getLatestMigrationReport(req: Request, res: Response) {
  try {
    const user = await requireAdminFromQuery(req, res);
    if (!user) return;
    const reportsDir = path.join(process.cwd(), 'tmp', 'migration-reports');
    await fsp.mkdir(reportsDir, { recursive: true });
    const entries = await fsp.readdir(reportsDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
        .map(async (e) => {
          const filePath = path.join(reportsDir, e.name);
          const st = await fsp.stat(filePath);
          return { name: e.name, filePath, updatedAt: Number(st.mtimeMs || 0) };
        }),
    );
    files.sort((a, b) => b.updatedAt - a.updatedAt);
    const latest = files[0];
    if (!latest) {
      return res.status(404).json({ error: 'Aucun rapport de migration trouvé' });
    }
    const raw = await fsp.readFile(latest.filePath, 'utf8');
    let content: unknown = null;
    try {
      content = JSON.parse(raw);
    } catch {
      content = raw;
    }
    res.json({
      reportFile: latest.name,
      updatedAt: latest.updatedAt,
      content,
    });
  } catch (err) {
    console.error('getLatestMigrationReport error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}
