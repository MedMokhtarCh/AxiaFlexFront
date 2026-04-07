import crypto from 'crypto';
import { AppDataSource } from '../data-source.js';
import { SaasTenantLicense } from '../entity/SaasTenantLicense.js';
import { User } from '../entity/User.js';
import { Product } from '../entity/Product.js';
import { Order } from '../entity/Order.js';

export const SAAS_LICENSE_SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

/** Modules reconnus par la sidebar (ids identiques à Sidebar.tsx). */
export const ALL_SAAS_MODULE_IDS = [
  'dashboard',
  'tables',
  'reports',
  'pos',
  'open-tickets',
  'kds',
  'gestion-article',
  'gestion-categories',
  'gestion-promotion',
  'gestion-stock',
  'achats',
  'analytics',
  'clients',
  'cash',
  'settings',
] as const;

const env = (k: string) =>
  String((process.env as Record<string, string | undefined>)[k] ?? '').trim();

const pepper = () =>
  env('SAAS_CODE_PEPPER') || 'axiaflex-saas-pepper-change-in-production';
const sessionSecret = () =>
  env('SAAS_SESSION_SECRET') || env('SAAS_CODE_PEPPER') || 'axiaflex-saas-session-change-me';

export function hashSuperAdminPin(code: string): string {
  const c = String(code || '').trim();
  return crypto.createHash('sha256').update(`${pepper()}:${c}`, 'utf8').digest('hex');
}

export function signSaasSessionToken(): string {
  const exp = Date.now() + 8 * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp, v: 1 }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySaasSessionToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    if (!crypto.timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number };
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

function normalizeEnabledModules(value: unknown): string[] {
  if (!Array.isArray(value)) return [...ALL_SAAS_MODULE_IDS];
  const set = new Set(ALL_SAAS_MODULE_IDS as readonly string[]);
  const out = value.map((x) => String(x || '').trim()).filter((x) => set.has(x));
  return out.length > 0 ? out : [...ALL_SAAS_MODULE_IDS];
}

function normalizeCompanyType(value: any): string | null {
  const raw = String(value ?? '').trim().toUpperCase();
  const allowed = new Set(['FAST_FOOD', 'RESTAURANT_CAFE', 'SHOP_SINGLE', 'SHOP_MULTI']);
  return allowed.has(raw) ? raw : null;
}

function readLimitFromJson(obj: any, keys: string[]): number | null | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (v === null || v === '') return null;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    return undefined;
  }
  return undefined;
}

function parseExpiresMs(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v > 1e12 ? Math.floor(v) : Math.floor(v * 1000);
  }
  const s = String(v).trim();
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : null;
}

function readExpiresFromJson(obj: any, keys: string[]): number | null | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (v === null || v === '') return null;
    const ms = parseExpiresMs(v);
    return ms !== null ? ms : undefined;
  }
  return undefined;
}

function readStringFromJson(obj: any, keys: string[]): string | null | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (v === null || v === '') return null;
    return String(v).trim() || null;
  }
  return undefined;
}

function mergeLicenseApiBody(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== 'object') return {};
  const o = json as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return { ...o, ...(inner as Record<string, unknown>) };
  }
  return { ...o };
}

export async function ensureLicenseRow(): Promise<SaasTenantLicense> {
  const repo = AppDataSource.getRepository(SaasTenantLicense);
  let row = await repo.findOne({ where: { id: SAAS_LICENSE_SINGLETON_ID } as any });
  if (row) return row;
  const defaultCode = env('SAAS_SUPER_ADMIN_CODE') || '999999';
  const created = repo.create({
    id: SAAS_LICENSE_SINGLETON_ID,
    superAdminPinHash: hashSuperAdminPin(defaultCode),
    maxUsers: null,
    maxProducts: null,
    maxOrders: null,
    enabledModules: null,
    companyTypeManagedBySaas: false,
    forcedCompanyType: null,
    licenseKey: null,
    licenseExpiresAt: null,
    externalLicenseApiEnabled: false,
    externalLicenseApiBaseUrl: null,
    externalLicenseVerifyPath: '/license/status',
    externalLicenseTenantId: null,
    externalLicenseApiToken: null,
    externalLicenseLastSyncAt: null,
    externalLicenseLastSyncStatus: null,
    externalLicenseLastSyncMessage: null,
    updatedAt: Date.now(),
  } as SaasTenantLicense);
  await repo.save(created);
  const again = await repo.findOne({ where: { id: SAAS_LICENSE_SINGLETON_ID } as any });
  if (!again) throw new Error('SaaS license row missing after bootstrap');
  return again;
}

export async function verifySuperAdminCode(code: string): Promise<boolean> {
  const row = await ensureLicenseRow();
  const h = hashSuperAdminPin(code);
  try {
    const a = Buffer.from(row.superAdminPinHash, 'hex');
    const b = Buffer.from(h, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isExpired(lic: SaasTenantLicense): boolean {
  const ex = lic.licenseExpiresAt != null ? Number(lic.licenseExpiresAt) : null;
  return ex != null && Number.isFinite(ex) && Date.now() > ex;
}

export async function assertLicenseActiveForWrites() {
  const lic = await ensureLicenseRow();
  if (isExpired(lic)) {
    throw new Error('Licence expiree : renouvelez la licence dans le Super Admin.');
  }
}

export async function assertUserQuota() {
  await assertLicenseActiveForWrites();
  const lic = await ensureLicenseRow();
  if (lic.maxUsers == null) return;
  const repo = AppDataSource.getRepository(User);
  const n = await repo.count();
  if (n >= lic.maxUsers) {
    throw new Error(
      `Limite utilisateurs atteinte (${lic.maxUsers}). Augmentez le quota dans le Super Admin.`,
    );
  }
}

export async function assertProductQuota() {
  await assertLicenseActiveForWrites();
  const lic = await ensureLicenseRow();
  if (lic.maxProducts == null) return;
  const repo = AppDataSource.getRepository(Product);
  const n = await repo.count();
  if (n >= lic.maxProducts) {
    throw new Error(
      `Limite articles atteinte (${lic.maxProducts}). Augmentez le quota dans le Super Admin.`,
    );
  }
}

export async function assertOrderQuota() {
  await assertLicenseActiveForWrites();
  const lic = await ensureLicenseRow();
  if (lic.maxOrders == null) return;
  const repo = AppDataSource.getRepository(Order);
  const n = await repo.count();
  if (n >= lic.maxOrders) {
    throw new Error(
      `Limite commandes (tickets) atteinte (${lic.maxOrders}). Augmentez le quota dans le Super Admin.`,
    );
  }
}

/** Métadonnées sync abonnement externe (pas de secrets). */
export type SaasExternalSubscriptionPublic = {
  enabled: boolean;
  lastSyncAt: number | null;
  lastStatus: string | null;
  lastMessage: string | null;
};

export type SaasTenantLicensePayload = {
  maxUsers: number | null;
  maxProducts: number | null;
  maxOrders: number | null;
  usage: { users: number; products: number; orders: number };
  enabledModules: string[];
  companyTypeManagedBySaas: boolean;
  forcedCompanyType: string | null;
  licenseKey: string | null;
  licenseExpiresAt: number | null;
  licenseExpired: boolean;
  superAdminCodePlaceholder?: string;
  externalSubscription: SaasExternalSubscriptionPublic;
};

export type SaasSuperAdminLicenseExtras = {
  externalLicenseApiEnabled: boolean;
  externalLicenseApiBaseUrl: string | null;
  externalLicenseVerifyPath: string | null;
  externalLicenseTenantId: string | null;
  externalLicenseApiTokenConfigured: boolean;
  externalLicenseLastSyncAt: number | null;
  externalLicenseLastSyncStatus: string | null;
  externalLicenseLastSyncMessage: string | null;
};

function externalSubscriptionPublic(lic: SaasTenantLicense): SaasExternalSubscriptionPublic {
  return {
    enabled: Boolean(lic.externalLicenseApiEnabled),
    lastSyncAt:
      lic.externalLicenseLastSyncAt != null ? Number(lic.externalLicenseLastSyncAt) : null,
    lastStatus: lic.externalLicenseLastSyncStatus || null,
    lastMessage: lic.externalLicenseLastSyncMessage
      ? String(lic.externalLicenseLastSyncMessage).slice(0, 500)
      : null,
  };
}

export function getSuperAdminLicenseExtras(lic: SaasTenantLicense): SaasSuperAdminLicenseExtras {
  const tok = lic.externalLicenseApiToken;
  return {
    externalLicenseApiEnabled: Boolean(lic.externalLicenseApiEnabled),
    externalLicenseApiBaseUrl: lic.externalLicenseApiBaseUrl || null,
    externalLicenseVerifyPath: lic.externalLicenseVerifyPath || null,
    externalLicenseTenantId: lic.externalLicenseTenantId || null,
    externalLicenseApiTokenConfigured: typeof tok === 'string' && tok.length > 0,
    externalLicenseLastSyncAt:
      lic.externalLicenseLastSyncAt != null ? Number(lic.externalLicenseLastSyncAt) : null,
    externalLicenseLastSyncStatus: lic.externalLicenseLastSyncStatus || null,
    externalLicenseLastSyncMessage: lic.externalLicenseLastSyncMessage || null,
  };
}

export async function getTenantLicenseSnapshot(): Promise<SaasTenantLicensePayload> {
  const lic = await ensureLicenseRow();
  const [users, products, orders] = await Promise.all([
    AppDataSource.getRepository(User).count(),
    AppDataSource.getRepository(Product).count(),
    AppDataSource.getRepository(Order).count(),
  ]);
  const enabledModules =
    lic.enabledModules == null ? [...ALL_SAAS_MODULE_IDS] : normalizeEnabledModules(lic.enabledModules);
  return {
    maxUsers: lic.maxUsers,
    maxProducts: lic.maxProducts,
    maxOrders: lic.maxOrders,
    usage: { users, products, orders },
    enabledModules,
    companyTypeManagedBySaas: Boolean(lic.companyTypeManagedBySaas),
    forcedCompanyType: lic.forcedCompanyType || null,
    licenseKey: lic.licenseKey || null,
    licenseExpiresAt: lic.licenseExpiresAt != null ? Number(lic.licenseExpiresAt) : null,
    licenseExpired: isExpired(lic),
    externalSubscription: externalSubscriptionPublic(lic),
  };
}

export type SaasLicenseAdminDto = {
  maxUsers?: number | null;
  maxProducts?: number | null;
  maxOrders?: number | null;
  enabledModules?: string[];
  companyTypeManagedBySaas?: boolean;
  forcedCompanyType?: string | null;
  licenseKey?: string | null;
  licenseExpiresAt?: number | null;
  newSuperAdminCode?: string | null;
  externalLicenseApiEnabled?: boolean;
  externalLicenseApiBaseUrl?: string | null;
  externalLicenseVerifyPath?: string | null;
  externalLicenseTenantId?: string | null;
  /** null ou "" = effacer le token ; absent = ne pas modifier. */
  externalLicenseApiToken?: string | null;
};

export async function updateLicenseFromSuperAdmin(dto: SaasLicenseAdminDto): Promise<SaasTenantLicense> {
  const repo = AppDataSource.getRepository(SaasTenantLicense);
  const lic = await ensureLicenseRow();
  if (dto.maxUsers !== undefined) lic.maxUsers = dto.maxUsers;
  if (dto.maxProducts !== undefined) lic.maxProducts = dto.maxProducts;
  if (dto.maxOrders !== undefined) lic.maxOrders = dto.maxOrders;
  if (dto.enabledModules !== undefined) lic.enabledModules = normalizeEnabledModules(dto.enabledModules);
  if (dto.companyTypeManagedBySaas !== undefined) {
    lic.companyTypeManagedBySaas = dto.companyTypeManagedBySaas;
    if (!lic.companyTypeManagedBySaas) lic.forcedCompanyType = null;
  }
  if (dto.forcedCompanyType !== undefined && lic.companyTypeManagedBySaas) {
    lic.forcedCompanyType = normalizeCompanyType(dto.forcedCompanyType);
  }
  if (dto.licenseKey !== undefined) lic.licenseKey = dto.licenseKey;
  if (dto.licenseExpiresAt !== undefined) lic.licenseExpiresAt = dto.licenseExpiresAt;
  if (dto.externalLicenseApiEnabled !== undefined) {
    lic.externalLicenseApiEnabled = Boolean(dto.externalLicenseApiEnabled);
  }
  if (dto.externalLicenseApiBaseUrl !== undefined) {
    const u = String(dto.externalLicenseApiBaseUrl || '').trim();
    lic.externalLicenseApiBaseUrl = u ? u : null;
  }
  if (dto.externalLicenseVerifyPath !== undefined) {
    const p = String(dto.externalLicenseVerifyPath || '').trim();
    lic.externalLicenseVerifyPath = p ? p : '/license/status';
  }
  if (dto.externalLicenseTenantId !== undefined) {
    const t = String(dto.externalLicenseTenantId || '').trim();
    lic.externalLicenseTenantId = t ? t : null;
  }
  if (dto.externalLicenseApiToken !== undefined) {
    const t = dto.externalLicenseApiToken;
    if (t === null || t === '') lic.externalLicenseApiToken = null;
    else lic.externalLicenseApiToken = String(t).trim();
  }
  const newCode = String(dto.newSuperAdminCode || '').trim();
  if (newCode.length >= 4) {
    lic.superAdminPinHash = hashSuperAdminPin(newCode);
  }
  lic.updatedAt = Date.now();
  await repo.save(lic);
  return lic;
}

/**
 * POST vers l’URL configurée avec JSON { tenantId, licenseKey }.
 * Attend une réponse JSON (éventuellement { data: { ... } }) pouvant contenir :
 * maxUsers, maxProducts, maxOrders, licenseExpiresAt, enabledModules, licenseKey.
 */
export async function syncLicenseFromExternalApi(): Promise<{
  ok: boolean;
  message?: string;
}> {
  const repo = AppDataSource.getRepository(SaasTenantLicense);
  const lic = await ensureLicenseRow();

  const recordFailure = async (msg: string) => {
    lic.externalLicenseLastSyncAt = Date.now();
    lic.externalLicenseLastSyncStatus = 'error';
    lic.externalLicenseLastSyncMessage = msg.slice(0, 500);
    lic.updatedAt = Date.now();
    await repo.save(lic);
    return { ok: false as const, message: msg };
  };

  if (!lic.externalLicenseApiEnabled) {
    return recordFailure('API externe désactivée.');
  }
  const base = String(lic.externalLicenseApiBaseUrl || '')
    .trim()
    .replace(/\/$/, '');
  if (!base) return recordFailure('URL de base de l’API manquante.');
  let path = String(lic.externalLicenseVerifyPath || '').trim() || '/license/status';
  const url = path.startsWith('http')
    ? path
    : `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  const controller = new AbortController();
  const timeoutMs = 20000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const token = lic.externalLicenseApiToken?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const body = JSON.stringify({
      tenantId: lic.externalLicenseTenantId || null,
      licenseKey: lic.licenseKey || null,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      return await recordFailure(`Réponse non JSON (HTTP ${res.status}).`);
    }

    const merged = mergeLicenseApiBody(parsed);

    if (!res.ok) {
      const errPiece =
        (merged &&
          (merged.error ?? merged.message ?? merged.detail ?? merged.statusText)) ||
        `HTTP ${res.status}`;
      return await recordFailure(String(errPiece).slice(0, 400));
    }

    const uLim = readLimitFromJson(merged, ['maxUsers', 'max_users', 'userLimit', 'user_limit']);
    if (uLim !== undefined) lic.maxUsers = uLim;
    const pLim = readLimitFromJson(merged, [
      'maxProducts',
      'max_products',
      'productLimit',
      'product_limit',
    ]);
    if (pLim !== undefined) lic.maxProducts = pLim;
    const oLim = readLimitFromJson(merged, [
      'maxOrders',
      'max_orders',
      'orderLimit',
      'order_limit',
      'ticketLimit',
      'ticket_limit',
    ]);
    if (oLim !== undefined) lic.maxOrders = oLim;

    const exp = readExpiresFromJson(merged, [
      'licenseExpiresAt',
      'license_expires_at',
      'expiresAt',
      'expires_at',
      'validUntil',
      'valid_until',
    ]);
    if (exp !== undefined) lic.licenseExpiresAt = exp;

    const lk = readStringFromJson(merged, ['licenseKey', 'license_key', 'subscriptionKey']);
    if (lk !== undefined) lic.licenseKey = lk;

    const modRaw = merged.enabledModules ?? merged.enabled_modules ?? merged.modules;
    if (modRaw !== undefined) {
      lic.enabledModules = normalizeEnabledModules(modRaw);
    }

    const forced = readStringFromJson(merged, [
      'forcedCompanyType',
      'forced_company_type',
      'companyType',
      'company_type',
    ]);
    if (forced !== undefined && lic.companyTypeManagedBySaas) {
      lic.forcedCompanyType = normalizeCompanyType(forced);
    }

    lic.externalLicenseLastSyncAt = Date.now();
    lic.externalLicenseLastSyncStatus = 'ok';
    lic.externalLicenseLastSyncMessage = null;
    lic.updatedAt = Date.now();
    await repo.save(lic);
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'AbortError'
        ? `Délai dépassé (${timeoutMs / 1000}s).`
        : (e as Error)?.message || 'Erreur réseau.';
    return await recordFailure(msg);
  } finally {
    clearTimeout(timer);
  }
}

/** Omettre le type société côté tenant si verrouillé par SaaS. */
export function stripCompanyTypeFromTenantUpdateIfLocked(
  update: Record<string, unknown>,
  managed: boolean,
): Record<string, unknown> {
  if (!managed || !update) return update;
  const u = { ...update };
  delete u.companyType;
  return u;
}
