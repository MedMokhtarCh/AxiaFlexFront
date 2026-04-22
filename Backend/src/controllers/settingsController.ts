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
      "<!DOCTYPE html>",
      "<html lang=\"fr\">",
      "<head>",
      "  <meta charset=\"UTF-8\" />",
      "  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\" />",
      "  <style>",
      "    * { margin: 0; padding: 0; box-sizing: border-box; }",
      "    @page { size: 80mm auto; margin: 0; }",
      "    html, body { height: fit-content; min-height: 0; overflow: visible; background: #f1f5f9; font-family: Arial, Helvetica, sans-serif; padding: 3mm; }",
      "    .card { background: #fff; border-radius: 10px; padding: 12px; border: 2px solid #0f172a; }",
      "    .sep { border: none; border-top: 1px dashed #cbd5e1; margin: 6px 0; }",
      "    .meta { font-size: 9px; color: #64748b; line-height: 1.5; }",
      "    .line { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; font-weight: 700; color: #374151; margin-bottom: 2px; }",
      "    .line .u { font-weight: 400; color: #94a3b8; }",
      "    .tot { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: #1e293b; line-height: 1.9; }",
      "    .tot.ttc { color: #4338ca; font-size: 14px; font-weight: 900; }",
      "    .fiscal { font-size: 10px; color: #0f172a; line-height: 1.5; }",
      "    .qr { text-align: center; margin-top: 8px; }",
      "    .qr img { width: 180px; height: 180px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; padding: 6px; }",
      "    .qr p { font-size: 9px; color: #64748b; margin-top: 4px; }",
      "  </style>",
      "</head>",
      "<body>",
      "  <div class=\"card\">",
      "    <div style=\"text-align:center;font-size:16px;font-weight:900;color:#1e293b\">{{nacefMerchantName}}</div>",
      "    <div style=\"text-align:center;font-size:9px;color:#64748b;margin-top:2px\">FORMAT NACEF 1.1.4</div>",
      "    <hr class=\"sep\" />",
      "    <div class=\"meta\">",
      "      <div>Version: {{nacefVersion}}</div>",
      "      <div>Transaction: {{nacefTransactionId}}</div>",
      "      <div>Date: {{nacefTimestamp}}</div>",
      "      <div>Opération: {{nacefOperationType}} / {{nacefOperationContext}}</div>",
      "      <div>IMDF: {{fiscalImdf}}</div>",
      "      <div>MF: {{nacefMf}}</div>",
      "    </div>",
      "    <hr class=\"sep\" />",
      "    {{#each nacefSaleDetails}}",
      "      <div class=\"line\">",
      "        <span>{{this.quantity}}x {{this.name}} <span class=\"u\">({{this.unitPrice}} {{currency}})</span></span>",
      "        <span style=\"white-space:nowrap\">{{this.total}} {{currency}}</span>",
      "      </div>",
      "    {{/each}}",
      "    <hr class=\"sep\" />",
      "    <div class=\"tot\"><span>Prix HT</span><span>{{nacefTotalHt}} {{currency}}</span></div>",
      "    <div class=\"tot\"><span>TVA</span><span>{{nacefTotalTva}} {{currency}}</span></div>",
      "    <div class=\"tot ttc\"><span>Prix TTC</span><span>{{nacefTotalTtc}} {{currency}}</span></div>",
      "    {{#each nacefPaymentDetails}}",
      "      <div class=\"meta\" style=\"display:flex;justify-content:space-between\">",
      "        <span>{{this.method}}</span><span>{{this.amount}} {{currency}}</span>",
      "      </div>",
      "    {{/each}}",
      "    <hr class=\"sep\" />",
      "    <div class=\"fiscal\">",
      "      <div style=\"font-weight:900\">BLOC FISCAL NACEF</div>",
      "      <div>Statut: {{fiscalStatus}}</div>",
      "      <div>Mode: {{fiscalMode}}</div>",
      "      <div>Code erreur: {{fiscalErrorCode}}</div>",
      "    </div>",
      "    <div class=\"qr\">",
      "      <img src=\"https://quickchart.io/qr?text={{fiscalQrPayloadEncoded}}&size=180&ecLevel=H&margin=2\" alt=\"QR NACEF\" />",
      "      <p>QR fiscal NACEF</p>",
      "    </div>",
      "  </div>",
      "</body>",
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
