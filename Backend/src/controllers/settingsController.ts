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
import { buildPrintTemplatePreview } from '../services/printerService.js';
import { getSettings as getRuntimeSettings } from '../services/settingsService.js';
import { pingDesktopBridge } from '../services/printerService.js';

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

export async function downloadClientReceiptTemplateSample(_req: Request, res: Response) {
  try {
    const sample = [
      '==============================',
      '{{restaurantName}}',
      '{{headerText}}',
      'Ticket {{ticketCode}}',
      'Commande {{orderNumber}}',
      'Table: {{tableNumber}}',
      'Serveur: {{serverName}}',
      'Date: {{createdAt}}',
      'Adresse: {{address}}',
      'Tel: {{phone}}',
      'MF: {{taxId}}',
      '------------------------------',
      '{{itemsLines}}',
      '------------------------------',
      'Sous-total: {{subtotal}} {{currency}}',
      'Remise: {{discount}} {{currency}}',
      'Timbre: {{timbre}} {{currency}}',
      'Total TTC: {{total}} {{currency}}',
      'Règlement: {{amount}} {{currency}}',
      '{{footerText}}',
      '==============================',
      '',
      '# Place ce fichier ici (Windows):',
      '# C:\\ProgramData\\AxiaFlex\\templates\\client-receipt-template.txt',
      '# Le moteur remplacera automatiquement les placeholders.',
      '',
    ].join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="client-receipt-template.sample.txt"',
    );
    res.send(sample);
  } catch (err) {
    console.error('downloadClientReceiptTemplateSample error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function downloadNacefHtmlTemplateSample(_req: Request, res: Response) {
  try {
    const sample = [
      "<!doctype html>",
      "<html lang=\"fr\">",
      "  <head>",
      "    <meta charset=\"utf-8\" />",
      "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
      "    <style>",
      "      @page { size: 80mm auto; margin: 0; }",
      "      html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; }",
      "      .wrap { width: 76mm; margin: 0 auto; padding: 2.5mm 0; color: #0f172a; }",
      "      .logo { width: 62px; height: 62px; border-radius: 999px; object-fit: cover; display: block; margin: 0 auto 8px; }",
      "      .title { text-align: center; font-size: 20px; font-weight: 900; margin: 2px 0; }",
      "      .meta { text-align: center; font-size: 12px; color: #475569; margin: 2px 0; }",
      "      .sep { border: 0; border-top: 1px dashed #94a3b8; margin: 8px 0; }",
      "      .row { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; margin: 4px 0; }",
      "      .tot { font-size: 17px; font-weight: 900; }",
      "      .small { font-size: 11px; color: #334155; }",
      "    </style>",
      "  </head>",
      "  <body>",
      "    <div class=\"wrap\">",
      "      <img class=\"logo\" src=\"{{logoUrl}}\" alt=\"logo\"/>",
      "      <div class=\"title\">{{restaurantName}}</div>",
      "      <div class=\"meta\">TICKET FISCAL NACEF</div>",
      "      <div class=\"meta\">{{createdAt}}</div>",
      "      <div class=\"meta\">Ticket: {{ticketCode}} - Cmd: {{orderNumber}}</div>",
      "      <div class=\"meta\">Table: {{tableNumber}} | Serveur: {{serverName}}</div>",
      "      <hr class=\"sep\"/>",
      "      {{#each items}}",
      "      <div class=\"row\"><span>{{this.quantity}} x {{this.name}}</span><span>{{this.total}} {{currency}}</span></div>",
      "      {{/each}}",
      "      <hr class=\"sep\"/>",
      "      <div class=\"row\"><span>Prix HT</span><span>{{subtotal}} {{currency}}</span></div>",
      "      <div class=\"row\"><span>Remise</span><span>-{{discount}} {{currency}}</span></div>",
      "      <div class=\"row\"><span>Timbre</span><span>{{timbre}} {{currency}}</span></div>",
      "      <div class=\"row tot\"><span>Prix TTC</span><span>{{total}} {{currency}}</span></div>",
      "      <hr class=\"sep\"/>",
      "      <div class=\"small\">MF: {{taxId}}</div>",
      "      <div class=\"small\">Paiement: {{amount}} {{currency}}</div>",
      "      <div class=\"small\">Ref: {{orderRef}}</div>",
      "      <div class=\"small\" style=\"text-align:center;margin-top:8px\">{{footerText}}</div>",
      "    </div>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=\"client-nacef-template.sample.html\"',
    );
    res.send(sample);
  } catch (err) {
    console.error('downloadNacefHtmlTemplateSample error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function downloadPrintTemplatePreview(req: Request, res: Response) {
  try {
    const kindRaw = String(req.query.kind || 'client').trim().toLowerCase();
    const formatRaw = String(req.query.format || 'pdf').trim().toLowerCase();
    const kind =
      kindRaw === 'bar' || kindRaw === 'kitchen' || kindRaw === 'client'
        ? (kindRaw as 'bar' | 'kitchen' | 'client')
        : 'client';
    const format = formatRaw === 'html' ? 'html' : 'pdf';
    const out = await buildPrintTemplatePreview({ kind, format });
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.send(out.buffer);
  } catch (err) {
    console.error('downloadPrintTemplatePreview error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function testDesktopBridge(_req: Request, res: Response) {
  try {
    const settings = await getRuntimeSettings();
    const out = await pingDesktopBridge(settings);
    res.json({ ok: true, ...(out as any) });
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Desktop Bridge KO' });
  }
}

export async function getSecurityOperationalStatus(req: Request, res: Response) {
  try {
    const user = await requireAdminFromQuery(req, res);
    if (!user) return;
    const settings = (await getRuntimeSettings()) as any;
    const checks: Array<{
      key: string;
      level: 'ok' | 'warning' | 'critical';
      message: string;
    }> = [];
    const push = (
      key: string,
      condition: boolean,
      okMessage: string,
      koMessage: string,
      koLevel: 'warning' | 'critical' = 'warning',
    ) => {
      checks.push({
        key,
        level: condition ? 'ok' : koLevel,
        message: condition ? okMessage : koMessage,
      });
    };

    const nacefEnabled = Boolean(settings?.nacefEnabled);
    const imdf = String(settings?.nacefImdf || '').trim().toUpperCase();
    push(
      'nacef.imdf',
      !nacefEnabled || /^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(imdf),
      'IMDF conforme.',
      'IMDF manquant ou invalide pour une fiscalisation active.',
      'critical',
    );

    const extApi = (settings?.externalRestaurantCardApi || {}) as any;
    const extEnabled = Boolean(extApi?.enabled);
    push(
      'externalRestaurantCardApi.url',
      !extEnabled || String(extApi?.url || '').trim().length > 0,
      'URL API carte restaurant configurée.',
      'API carte restaurant activée sans URL.',
      'warning',
    );
    push(
      'externalRestaurantCardApi.token',
      !extEnabled || String(extApi?.token || '').trim().length > 0,
      'Token API carte restaurant présent.',
      'API carte restaurant activée sans token.',
      'critical',
    );

    const routingMode = String(settings?.printRoutingMode || 'LOCAL').trim().toUpperCase();
    const bridge = (settings?.desktopPrintBridge || {}) as any;
    const bridgeRequired = routingMode === 'DESKTOP_BRIDGE';
    push(
      'desktopBridge.url',
      !bridgeRequired || String(bridge?.url || '').trim().length > 0,
      'URL Desktop Bridge configurée.',
      'Mode Desktop Bridge actif sans URL.',
      'warning',
    );
    push(
      'desktopBridge.token',
      !bridgeRequired || String(bridge?.token || '').trim().length > 0,
      'Token Desktop Bridge présent.',
      'Mode Desktop Bridge actif sans token.',
      'critical',
    );

    const hasCritical = checks.some((c) => c.level === 'critical');
    const hasWarning = checks.some((c) => c.level === 'warning');
    const overall: 'ok' | 'warning' | 'critical' = hasCritical
      ? 'critical'
      : hasWarning
      ? 'warning'
      : 'ok';

    return res.json({
      overall,
      generatedAt: Date.now(),
      checks,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}
