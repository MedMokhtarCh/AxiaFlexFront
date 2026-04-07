import { Request, Response } from 'express';
import * as settingsService from '../services/settingsService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';

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

const resolvePdfArchiveBaseDir = async () => {
  const settings = await settingsService.getSettings();
  const configured = String((settings as any)?.receiptPdfDirectory || '').trim();
  return configured || path.join(process.cwd(), 'tmp', 'pdf-archives');
};

const isInside = (baseDir: string, targetPath: string) => {
  const rel = path.relative(baseDir, targetPath);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

export async function listPdfArchives(_req: Request, res: Response) {
  try {
    const baseDir = await resolvePdfArchiveBaseDir();
    await fsp.mkdir(baseDir, { recursive: true });
    const categories = await fsp.readdir(baseDir, { withFileTypes: true });
    const out: Array<{
      category: string;
      path: string;
      files: Array<{ name: string; relativePath: string; size: number; updatedAt: number }>;
    }> = [];

    for (const cat of categories) {
      if (!cat.isDirectory()) continue;
      const catPath = path.join(baseDir, cat.name);
      const nested = await fsp.readdir(catPath, { withFileTypes: true });
      const files: Array<{ name: string; relativePath: string; size: number; updatedAt: number }> = [];

      for (const item of nested) {
        if (item.isDirectory()) {
          const subPath = path.join(catPath, item.name);
          const subFiles = await fsp.readdir(subPath, { withFileTypes: true });
          for (const sf of subFiles) {
            if (!sf.isFile() || !sf.name.toLowerCase().endsWith('.pdf')) continue;
            const fp = path.join(subPath, sf.name);
            const st = await fsp.stat(fp);
            files.push({
              name: sf.name,
              relativePath: path.relative(baseDir, fp),
              size: Number(st.size || 0),
              updatedAt: Number(st.mtimeMs || Date.now()),
            });
          }
        } else if (item.isFile() && item.name.toLowerCase().endsWith('.pdf')) {
          const fp = path.join(catPath, item.name);
          const st = await fsp.stat(fp);
          files.push({
            name: item.name,
            relativePath: path.relative(baseDir, fp),
            size: Number(st.size || 0),
            updatedAt: Number(st.mtimeMs || Date.now()),
          });
        }
      }

      files.sort((a, b) => b.updatedAt - a.updatedAt);
      out.push({
        category: cat.name,
        path: catPath,
        files: files.slice(0, 200),
      });
    }

    out.sort((a, b) => a.category.localeCompare(b.category));
    res.json({
      baseDir,
      categories: out,
    });
  } catch (err) {
    console.error('listPdfArchives error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function downloadPdfArchiveFile(req: Request, res: Response) {
  try {
    const baseDir = await resolvePdfArchiveBaseDir();
    const rel = String(req.query.path || '').trim();
    if (!rel) return res.status(400).json({ error: 'Missing file path' });
    const target = path.resolve(baseDir, rel);
    if (!isInside(baseDir, target)) {
      return res.status(403).json({ error: 'Path is outside archive directory' });
    }
    const st = await fsp.stat(target);
    if (!st.isFile()) return res.status(404).json({ error: 'File not found' });
    res.download(target, path.basename(target));
  } catch (err) {
    console.error('downloadPdfArchiveFile error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}
