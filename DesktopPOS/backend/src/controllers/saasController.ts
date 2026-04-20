import { Request, Response } from 'express';
import * as saas from '../services/saasLicenseService.js';
import type { SaasLicenseAdminDto } from '../services/saasLicenseService.js';
import * as settingsService from '../services/settingsService.js';
import * as fileLog from '../services/fileAuditLogService.js';
import * as agentService from '../services/agentService.js';
import { AppDataSource } from '../data-source.js';
import { TerminalNode } from '../entity/TerminalNode.js';

function bearer(req: Request): string | undefined {
  const h = req.headers.authorization || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : undefined;
}

export async function verifySuperAdmin(req: Request, res: Response) {
  try {
    const code = String((req.body || {}).code || '').trim();
    if (code.length < 4) {
      return res.status(400).json({ error: 'Code trop court (min. 4 caractères).' });
    }
    const ok = await saas.verifySuperAdminCode(code);
    if (!ok) return res.status(401).json({ error: 'Code Super Admin invalide.' });
    const token = saas.signSaasSessionToken();
    return res.json({ token, expiresInHours: 8 });
  } catch (e) {
    return res.status(500).json({ error: (e as any)?.message || 'Server error' });
  }
}

export async function getLicense(req: Request, res: Response) {
  try {
    if (!saas.verifySaasSessionToken(bearer(req))) {
      return res.status(401).json({ error: 'Session Super Admin requise.' });
    }
    const lic = await saas.ensureLicenseRow();
    const snapshot = await saas.getTenantLicenseSnapshot();
    const settings = await settingsService.getSettings();
    const extras = saas.getSuperAdminLicenseExtras(lic);
    return res.json({
      ...snapshot,
      ...extras,
      appliedCompanyType: (settings as any)?.companyType || null,
      allModuleIds: saas.ALL_SAAS_MODULE_IDS,
      updatedAt: lic.updatedAt,
    });
  } catch (e) {
    return res.status(500).json({ error: (e as any)?.message || 'Server error' });
  }
}

export async function patchLicense(req: Request, res: Response) {
  try {
    if (!saas.verifySaasSessionToken(bearer(req))) {
      return res.status(401).json({ error: 'Session Super Admin requise.' });
    }
    const body = req.body || {};
    const toNull = (v: any) =>
      v === '' || v === undefined ? null : v;
    const nOrNull = (v: any) => {
      if (v === '' || v === undefined || v === null) return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    };
    const patch: SaasLicenseAdminDto = {};
    if (body.maxUsers !== undefined) patch.maxUsers = nOrNull(body.maxUsers);
    if (body.maxProducts !== undefined) patch.maxProducts = nOrNull(body.maxProducts);
    if (body.maxOrders !== undefined) patch.maxOrders = nOrNull(body.maxOrders);
    if (body.maxTerminals !== undefined) patch.maxTerminals = nOrNull(body.maxTerminals);
    if (Array.isArray(body.enabledModules)) patch.enabledModules = body.enabledModules;
    if (Array.isArray(body.allowedTerminalPlans)) {
      patch.allowedTerminalPlans = body.allowedTerminalPlans;
    }
    if (body.activePlanCode !== undefined) {
      patch.activePlanCode = body.activePlanCode;
    }
    if (
      body.modulesByPlan !== undefined &&
      body.modulesByPlan &&
      typeof body.modulesByPlan === 'object' &&
      !Array.isArray(body.modulesByPlan)
    ) {
      patch.modulesByPlan = body.modulesByPlan;
    }
    if (body.companyTypeManagedBySaas !== undefined) {
      patch.companyTypeManagedBySaas = Boolean(body.companyTypeManagedBySaas);
    }
    if (body.forcedCompanyType !== undefined)
      patch.forcedCompanyType = toNull(body.forcedCompanyType);
    if (body.licenseKey !== undefined) patch.licenseKey = toNull(body.licenseKey);
    if (body.licenseExpiresAt !== undefined) {
      patch.licenseExpiresAt =
        body.licenseExpiresAt === '' || body.licenseExpiresAt === null
          ? null
          : Number(body.licenseExpiresAt);
    }
    if (body.newSuperAdminCode !== undefined) patch.newSuperAdminCode = body.newSuperAdminCode;

    if (body.externalLicenseApiEnabled !== undefined) {
      patch.externalLicenseApiEnabled = Boolean(body.externalLicenseApiEnabled);
    }
    if (body.externalLicenseApiBaseUrl !== undefined) {
      patch.externalLicenseApiBaseUrl = toNull(body.externalLicenseApiBaseUrl);
    }
    if (body.externalLicenseVerifyPath !== undefined) {
      patch.externalLicenseVerifyPath = toNull(body.externalLicenseVerifyPath);
    }
    if (body.externalLicenseTenantId !== undefined) {
      patch.externalLicenseTenantId = toNull(body.externalLicenseTenantId);
    }
    if (body.externalLicenseApiToken !== undefined) {
      const t = body.externalLicenseApiToken;
      patch.externalLicenseApiToken =
        t === null || t === '' ? null : String(t);
    }

    const lic = await saas.updateLicenseFromSuperAdmin(patch);
    if (lic.companyTypeManagedBySaas && lic.forcedCompanyType) {
      await settingsService.saveSettings({ companyType: lic.forcedCompanyType });
    }
    try {
      await fileLog.appendAuditLine('developer', {
        action: 'license_patch',
        patchKeys: Object.keys(patch),
        hasNewSuperAdminCode: Boolean(patch.newSuperAdminCode),
      });
    } catch {
      /* ne pas faire échouer la requête */
    }
    const snapshot = await saas.getTenantLicenseSnapshot();
    const settings = await settingsService.getSettings();
    return res.json({
      ...snapshot,
      appliedCompanyType: (settings as any)?.companyType || null,
    });
  } catch (e) {
    return res.status(500).json({ error: (e as any)?.message || 'Server error' });
  }
}

export async function listSaasTerminals(req: Request, res: Response) {
  try {
    if (!saas.verifySaasSessionToken(bearer(req))) {
      return res.status(401).json({ error: 'Session Super Admin requise.' });
    }
    const rows = await agentService.listTerminalsWithPrinters();
    return res.json({ terminals: rows });
  } catch (e) {
    return res.status(500).json({ error: (e as any)?.message || 'Server error' });
  }
}

export async function patchSaasTerminal(req: Request, res: Response) {
  try {
    if (!saas.verifySaasSessionToken(bearer(req))) {
      return res.status(401).json({ error: 'Session Super Admin requise.' });
    }
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id requis' });
    const repo = AppDataSource.getRepository(TerminalNode);
    const row = await repo.findOneBy({ id } as any);
    if (!row) return res.status(404).json({ error: 'Terminal introuvable' });
    const body = req.body || {};
    if (body.alias !== undefined) (row as any).alias = String(body.alias || '').trim().slice(0, 120) || (row as any).alias;
    if (body.siteName !== undefined) (row as any).siteName = body.siteName ? String(body.siteName).trim().slice(0, 120) : null;
    if (body.accessEnabled !== undefined) (row as any).accessEnabled = Boolean(body.accessEnabled);
    if (body.assignedPlan !== undefined) {
      const plan = String(body.assignedPlan || 'BASIC').trim().toUpperCase();
      const allowed = await saas.isTerminalPlanAllowed(plan);
      if (!allowed) return res.status(400).json({ error: 'Plan non autorisé par licence' });
      (row as any).assignedPlan = plan;
    }
    if (body.accessNote !== undefined) (row as any).accessNote = body.accessNote ? String(body.accessNote).trim().slice(0, 300) : null;
    (row as any).updatedAt = Date.now();
    const saved = await repo.save(row as any);
    try {
      await fileLog.appendAuditLine('developer', {
        action: 'terminal_patch',
        terminalId: id,
        alias: (saved as any).alias || null,
        accessEnabled: (saved as any).accessEnabled !== false,
        assignedPlan: (saved as any).assignedPlan || null,
      });
    } catch {
      /* ignore */
    }
    return res.json(saved);
  } catch (e) {
    return res.status(500).json({ error: (e as any)?.message || 'Server error' });
  }
}

export async function syncLicenseExternal(req: Request, res: Response) {
  try {
    if (!saas.verifySaasSessionToken(bearer(req))) {
      return res.status(401).json({ error: 'Session Super Admin requise.' });
    }
    const result = await saas.syncLicenseFromExternalApi();
    const lic = await saas.ensureLicenseRow();
    if (lic.companyTypeManagedBySaas && lic.forcedCompanyType) {
      await settingsService.saveSettings({ companyType: lic.forcedCompanyType });
    }
    const snapshot = await saas.getTenantLicenseSnapshot();
    try {
      await fileLog.appendAuditLine('developer', {
        action: 'license_sync_external',
        ok: result.ok,
        message: result.message ?? null,
      });
    } catch {
      /* ignore */
    }
    if (!result.ok) {
      return res.status(502).json({
        error: result.message || 'Synchronisation échouée.',
        snapshot,
      });
    }
    return res.json({ ok: true, snapshot });
  } catch (e) {
    return res.status(500).json({ error: (e as any)?.message || 'Server error' });
  }
}

export async function getDeveloperLogs(req: Request, res: Response) {
  try {
    if (!saas.verifySaasSessionToken(bearer(req))) {
      return res.status(401).json({ error: 'Session Super Admin requise.' });
    }
    const date = String((req.query as any).date || '').trim();
    if (date) {
      const content = await fileLog.readAuditLogDay('developer', date);
      return res.json({ date, content });
    }
    const days = await fileLog.listAuditDateFolders('developer');
    return res.json({ days });
  } catch (e) {
    return res.status(500).json({ error: (e as any)?.message || 'Server error' });
  }
}

export async function postDeveloperLog(req: Request, res: Response) {
  try {
    if (!saas.verifySaasSessionToken(bearer(req))) {
      return res.status(401).json({ error: 'Session Super Admin requise.' });
    }
    const message = String((req.body || {}).message || '').trim();
    if (!message) return res.status(400).json({ error: 'message requis' });
    await fileLog.appendAuditLine('developer', {
      action: 'manual_note',
      source: 'super_admin_ui',
      message,
      meta: (req.body || {}).meta,
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: (e as any)?.message || 'Server error' });
  }
}
