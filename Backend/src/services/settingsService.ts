import { AppDataSource } from '../data-source.js';
import { RestaurantSettings } from '../entity/RestaurantSettings.js';
import { ensureLicenseRow, getTenantLicenseSnapshot } from './saasLicenseService.js';

const defaultPosDiscountPresets = [
  { id: 'preset-fidelite', label: 'Fidélité', type: 'PERCENT' as const, value: 10 },
  { id: 'preset-staff', label: 'Staff', type: 'PERCENT' as const, value: 50 },
  { id: 'preset-vip', label: 'Offert VIP', type: 'PERCENT' as const, value: 100 },
];
const SECRET_MASK = '********';

const defaults = {
  companyType: 'RESTAURANT_CAFE',
  restaurantName: 'AxiaFlex',
  logoUrl: '',
  phone: '',
  email: '',
  taxId: '',
  address: '',
  predefinedNotes: [
    'Sans Oignon',
    'Trés Épicé',
    'Bien Cuit',
    'Sans Sel',
    'Extra Sauce',
    'Allergie',
  ],
  timbreValue: 1.0,
  tvaRate: 19,
  tvaCatalog: [
    { code: 'TVA_STD', label: 'TVA standard', rate: 19 },
  ],
  fiscalCategoryCatalog: [] as Array<{ articleCategory: string; familyCode: string; label?: string }>,
  applyTvaToTicket: true,
  applyTvaToInvoice: true,
  applyTimbreToTicket: true,
  applyTimbreToInvoice: true,
  printPreviewOnValidate: false,
  printAutoOnPreview: true,
  printRoutingMode: 'DESKTOP_BRIDGE' as const,
  nacefEnabled: false,
  nacefEnforcementMode: 'SOFT' as const,
  nacefMode: 'SIMULATED' as const,
  nacefImdf: '',
  nacefBaseUrl: 'http://127.0.0.1:10006',
  desktopPrintBridge: {
    enabled: true,
    url: 'http://127.0.0.1:17888',
    token: '',
    timeoutMs: 4000,
  },
  touchUiMode: false,
  clientKdsDisplayMode: 'STANDARD',
  clientKdsWallboardMinWidthPx: 1920,
  clientTicketPrintCopies: 1,
  clientTicketTemplate: 'CLASSIC',
  clientTicketLayout: {
    headerText: '',
    footerText: 'Merci et à bientôt !',
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showTaxId: true,
    showServer: true,
    showTable: true,
    showDate: true,
    showTicketNumber: true,
    showPriceHt: true,
    showTicketDiscount: true,
    showTimbre: true,
    showTva: true,
    showPriceTtc: true,
    showQrCode: false,
    showItemUnitPrice: true,
    showPaymentMethod: true,
    showTerminal: false,
    showClientName: false,
    showFiscalQrCode: false,
  },
  receiptPdfDirectory: '',
  autoDownloadReceiptPdfOnClient: false,
  kitchenBarPrintTemplates: {
    kitchen: {
      title: 'BON CUISINE',
      footerText: '',
      showOrderRef: true,
      showTime: true,
      showTable: true,
      showServer: true,
      showItemQty: true,
      showItemNotes: true,
    },
    bar: {
      title: 'BON BAR',
      footerText: '',
      showOrderRef: true,
      showTime: true,
      showTable: true,
      showServer: true,
      showItemQty: true,
      showItemNotes: true,
    },
  },
  designerPrintTemplates: {
    clientHtml: '',
    kitchenHtml: '',
    barHtml: '',
  },
  printTemplateSource: {
    client: 'BUILTIN' as const,
    kitchen: 'BUILTIN' as const,
    bar: 'BUILTIN' as const,
  },
  preventSaleOnInsufficientStock: true,
  currency: 'DT',
  terminalId: '',
  roomDisplayMode: 'plan' as const,
  ticketPrefix: 'TK-',
  ticketSequence: 0,
  invoicePrefix: 'INV-',
  invoiceSequence: 0,
  clientPrefix: 'CLI-',
  clientSequence: 0,
  stockDocumentPrefix: 'SD-',
  stockDocumentSequence: 0,
  productPrefix: 'ART-',
  productSequence: 0,
  posDiscountPresets: defaultPosDiscountPresets,
  externalRestaurantCardApi: {
    enabled: false,
    url: '',
    token: '',
    timeoutMs: 8000,
  },
  paymentEnabledMethods: ['CASH', 'BANK_CARD', 'RESTAURANT_CARD', 'RESTAURANT_TICKET'],
  cashClosingModePreference: 'AUTO' as const,
};

const normalizeCompanyType = (value: any) => {
  const raw = String(value ?? '').trim().toUpperCase();
  const allowed = new Set(['FAST_FOOD', 'RESTAURANT_CAFE', 'SHOP_SINGLE', 'SHOP_MULTI']);
  return allowed.has(raw) ? raw : defaults.companyType;
};

const normalizeCashClosingModePreference = (value: any): 'AUTO' | 'INDEPENDENT' | 'SHIFT_HANDOVER' => {
  const raw = String(value ?? 'AUTO').trim().toUpperCase();
  if (raw === 'INDEPENDENT' || raw === 'SHIFT_HANDOVER' || raw === 'AUTO') return raw;
  return 'AUTO';
};

const normalizePrintRoutingMode = (value: any): 'LOCAL' | 'CLOUD' | 'DESKTOP_BRIDGE' => {
  const raw = String(value ?? 'LOCAL').trim().toUpperCase();
  if (raw === 'CLOUD') return 'CLOUD';
  if (raw === 'DESKTOP_BRIDGE' || raw === 'DESKTOP') return 'DESKTOP_BRIDGE';
  return 'LOCAL';
};
const normalizeNacefEnforcementMode = (value: any): 'SOFT' | 'HARD' => {
  const raw = String(value ?? 'SOFT').trim().toUpperCase();
  return raw === 'HARD' ? 'HARD' : 'SOFT';
};
const normalizeNacefMode = (value: any): 'SIMULATED' | 'REMOTE' => {
  const raw = String(value ?? 'SIMULATED').trim().toUpperCase();
  return raw === 'REMOTE' ? 'REMOTE' : 'SIMULATED';
};
const normalizeNacefImdf = (value: any) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 64);
const normalizeNacefBaseUrl = (value: any) =>
  String(value ?? defaults.nacefBaseUrl)
    .trim()
    .slice(0, 500);
function normalizeDesktopPrintBridge(raw: any) {
  const base = (defaults as any).desktopPrintBridge || {};
  const timeoutMs = Number(raw?.timeoutMs ?? base.timeoutMs ?? 4000);
  return {
    enabled: Boolean(raw?.enabled ?? base.enabled),
    url: String(raw?.url ?? base.url ?? 'http://127.0.0.1:17888')
      .trim()
      .slice(0, 500),
    token: String(raw?.token ?? base.token ?? '').trim().slice(0, 500),
    timeoutMs: Number.isFinite(timeoutMs) ? Math.max(500, Math.min(30000, timeoutMs)) : 4000,
  };
}

/** Mode effectif après application du paramètre et du type de société. */
export function effectiveCashClosingMode(
  companyType: string,
  preference: 'AUTO' | 'INDEPENDENT' | 'SHIFT_HANDOVER',
): 'INDEPENDENT' | 'SHIFT_HANDOVER' {
  if (preference === 'INDEPENDENT') return 'INDEPENDENT';
  if (preference === 'SHIFT_HANDOVER') return 'SHIFT_HANDOVER';
  const ct = String(companyType || '').trim().toUpperCase();
  if (ct === 'RESTAURANT_CAFE') return 'SHIFT_HANDOVER';
  return 'INDEPENDENT';
}

const normalizeTicketTemplate = (value: any) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'COMPACT' || raw === 'MODERN' || raw === 'CLASSIC') return raw;
  return defaults.clientTicketTemplate;
};

const normalizeClientKdsDisplayMode = (value: any) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'WALLBOARD' || raw === 'STANDARD' || raw === 'AUTO') return raw;
  return defaults.clientKdsDisplayMode;
};

const normalizeClientKdsWallboardMinWidthPx = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaults.clientKdsWallboardMinWidthPx;
  return Math.max(800, Math.min(3840, Math.floor(n)));
};

const normalizeRoomDisplayMode = (value: any) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'simple' || raw === 'plan') return raw;
  return defaults.roomDisplayMode;
};

const normalizeTicketLayout = (raw: any) => {
  const base = defaults.clientTicketLayout as any;
  return {
    headerText: String(raw?.headerText ?? base.headerText).slice(0, 120),
    footerText: String(raw?.footerText ?? base.footerText).slice(0, 200),
    showLogo: raw?.showLogo ?? base.showLogo ? true : false,
    showAddress: raw?.showAddress ?? base.showAddress ? true : false,
    showPhone: raw?.showPhone ?? base.showPhone ? true : false,
    showTaxId: raw?.showTaxId ?? base.showTaxId ? true : false,
    showServer: raw?.showServer ?? base.showServer ? true : false,
    showTable: raw?.showTable ?? base.showTable ? true : false,
    showDate: raw?.showDate ?? base.showDate ? true : false,
    showTicketNumber: raw?.showTicketNumber ?? base.showTicketNumber ? true : false,
    showPriceHt: raw?.showPriceHt ?? base.showPriceHt ? true : false,
    showTicketDiscount: raw?.showTicketDiscount ?? base.showTicketDiscount ? true : false,
    showTimbre: raw?.showTimbre ?? base.showTimbre ? true : false,
    showTva: raw?.showTva ?? base.showTva ? true : false,
    showPriceTtc: raw?.showPriceTtc ?? base.showPriceTtc ? true : false,
    showQrCode: raw?.showQrCode ?? base.showQrCode ? true : false,
    showItemUnitPrice: raw?.showItemUnitPrice ?? base.showItemUnitPrice ? true : false,
    showPaymentMethod: raw?.showPaymentMethod ?? base.showPaymentMethod ? true : false,
    showTerminal: raw?.showTerminal ?? base.showTerminal ? true : false,
    showClientName: raw?.showClientName ?? base.showClientName ? true : false,
    showFiscalQrCode: raw?.showFiscalQrCode ?? base.showFiscalQrCode ? true : false,
  };
};

const normalizeProductionTemplate = (raw: any, base: any) => ({
  title: String(raw?.title ?? base.title ?? '').slice(0, 80) || String(base.title || ''),
  footerText: String(raw?.footerText ?? base.footerText ?? '').slice(0, 200),
  showOrderRef: raw?.showOrderRef ?? base.showOrderRef ? true : false,
  showTime: raw?.showTime ?? base.showTime ? true : false,
  showTable: raw?.showTable ?? base.showTable ? true : false,
  showServer: raw?.showServer ?? base.showServer ? true : false,
  showItemQty: raw?.showItemQty ?? base.showItemQty ? true : false,
  showItemNotes: raw?.showItemNotes ?? base.showItemNotes ? true : false,
});

const normalizeKitchenBarPrintTemplates = (raw: any) => {
  const base = defaults.kitchenBarPrintTemplates as any;
  return {
    kitchen: normalizeProductionTemplate(raw?.kitchen, base.kitchen),
    bar: normalizeProductionTemplate(raw?.bar, base.bar),
  };
};
const normalizeDesignerPrintTemplates = (raw: any) => {
  const base = (defaults as any).designerPrintTemplates || {};
  return {
    clientHtml: String(raw?.clientHtml ?? base.clientHtml ?? '').slice(0, 300_000),
    kitchenHtml: String(raw?.kitchenHtml ?? base.kitchenHtml ?? '').slice(0, 300_000),
    barHtml: String(raw?.barHtml ?? base.barHtml ?? '').slice(0, 300_000),
  };
};
const normalizePrintTemplateSource = (raw: any) => {
  const norm = (v: any) => String(v || '').toUpperCase() === 'DESIGNER' ? 'DESIGNER' : 'BUILTIN';
  return {
    client:  norm(raw?.client),
    kitchen: norm(raw?.kitchen),
    bar:     norm(raw?.bar),
  };
};

const parseNumeric = (value: any) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9,.-]/g, '');
  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount = (cleaned.match(/\./g) || []).length;
  let normalized = cleaned;
  if (commaCount > 0) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (dotCount > 1) {
    normalized = normalized.replace(/\./g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalizePosDiscountPresets(raw: any) {
  if (!Array.isArray(raw) || raw.length === 0) return [...defaultPosDiscountPresets];
  const out = raw
    .map((row: any, i: number) => ({
      id: String(row?.id || `preset-${i}`),
      label: String(row?.label || 'Remise').trim().slice(0, 80) || 'Remise',
      type: String(row?.type || 'PERCENT').toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'PERCENT',
      value: parseNumeric(row?.value),
    }))
    .filter((p: any) => {
      if (p.type === 'PERCENT') return p.value >= 0 && p.value <= 100;
      return p.value >= 0;
    });
  return out.length > 0 ? out : [...defaultPosDiscountPresets];
}

function normalizeExternalRestaurantCardApi(raw: any) {
  const url = String(raw?.url || '').trim();
  const timeoutMs = Number(raw?.timeoutMs || 8000);
  return {
    enabled: Boolean(raw?.enabled) && !!url,
    url: url.slice(0, 500),
    token: String(raw?.token || '').trim().slice(0, 500),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000,
  };
}

function applySecretMask(value: any) {
  const token = String(value || '').trim();
  return token ? SECRET_MASK : '';
}

function mergeSecretTokenInput(
  incomingToken: any,
  existingToken: any,
  defaultToken: any = '',
) {
  const incoming = String(incomingToken ?? '').trim();
  if (!incoming) return '';
  if (incoming === SECRET_MASK) {
    return String(existingToken ?? defaultToken ?? '').trim();
  }
  return incoming;
}

function maskSensitiveSettings(base: any) {
  const out = { ...base };
  const desktopPrintBridge = { ...((out as any).desktopPrintBridge || {}) };
  desktopPrintBridge.token = applySecretMask(desktopPrintBridge.token);
  (out as any).desktopPrintBridge = desktopPrintBridge;
  const externalRestaurantCardApi = {
    ...((out as any).externalRestaurantCardApi || {}),
  };
  externalRestaurantCardApi.token = applySecretMask(externalRestaurantCardApi.token);
  (out as any).externalRestaurantCardApi = externalRestaurantCardApi;
  return out;
}

function normalizeReceiptPdfDirectory(raw: any) {
  return String(raw ?? '').trim().slice(0, 500);
}

function normalizePaymentEnabledMethods(raw: any) {
  const allowed = new Set(['CASH', 'BANK_CARD', 'RESTAURANT_CARD', 'RESTAURANT_TICKET']);
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((v: any) => String(v || '').trim().toUpperCase())
    .filter((v: string) => allowed.has(v));
  const uniq = Array.from(new Set(out));
  return uniq.length > 0 ? uniq : [...defaults.paymentEnabledMethods];
}

function normalizePredefinedNotes(raw: any) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = Array.from(
    new Set(
      arr
        .map((v: any) => String(v ?? '').trim())
        .filter((v: string) => v.length > 0)
        .map((v: string) => v.slice(0, 80)),
    ),
  );
  return out.length > 0 ? out : [...defaults.predefinedNotes];
}

function normalizeTvaCatalog(raw: any, fallbackRateRaw: any) {
  const fallbackRate = parseNumeric(fallbackRateRaw);
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map((row: any, i: number) => ({
      code: String(row?.code || `TVA_${i + 1}`).trim().slice(0, 40).toUpperCase(),
      label: String(row?.label || '').trim().slice(0, 120),
      rate: parseNumeric(row?.rate),
    }))
    .filter((row: any) => row.code && row.rate >= 0);
  if (normalized.length > 0) return normalized;
  return [
    {
      code: 'TVA_STD',
      label: 'TVA standard',
      rate: fallbackRate >= 0 ? fallbackRate : Number((defaults as any).tvaRate || 19),
    },
  ];
}

function normalizeFiscalCategoryCatalog(raw: any) {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map((row: any) => ({
      articleCategory: String(
        row?.articleCategory ?? row?.productCategory ?? row?.category ?? '',
      )
        .trim()
        .slice(0, 120),
      familyCode: String(row?.familyCode ?? row?.code ?? '')
        .trim()
        .toUpperCase()
        .slice(0, 32),
      label: String(row?.label ?? '').trim().slice(0, 120),
    }))
    .filter((row: any) => row.articleCategory.length > 0 && row.familyCode.length > 0);
  const unique = new Map<string, { articleCategory: string; familyCode: string; label?: string }>();
  for (const row of normalized) unique.set(row.articleCategory, row);
  return Array.from(unique.values());
}

function validateFiscalCategoryCatalogOrThrow(raw: any) {
  const source = Array.isArray(raw) ? raw : [];
  const out: Array<{ articleCategory: string; familyCode: string; label?: string }> = [];
  const seenArticleCategories = new Set<string>();
  for (let i = 0; i < source.length; i += 1) {
    const row = source[i] || {};
    const articleCategory = String(
      row?.articleCategory ?? row?.productCategory ?? row?.category ?? '',
    )
      .trim()
      .slice(0, 120);
    const familyCode = String(row?.familyCode ?? row?.code ?? '')
      .trim()
      .toUpperCase()
      .slice(0, 32);
    const label = String(row?.label ?? '').trim().slice(0, 120);
    const isEmpty = articleCategory.length === 0 && familyCode.length === 0;
    if (isEmpty) continue;
    if (!articleCategory) {
      throw new Error(`Catalogue fiscal invalide: ligne ${i + 1}, catégorie article requise.`);
    }
    if (!familyCode) {
      throw new Error(`Catalogue fiscal invalide: ligne ${i + 1}, code famille requis.`);
    }
    if (!/^[A-Z0-9_]{2,32}$/.test(familyCode)) {
      throw new Error(
        `Catalogue fiscal invalide: ligne ${i + 1}, code famille "${familyCode}" invalide (A-Z0-9_, 2-32).`,
      );
    }
    if (seenArticleCategories.has(articleCategory)) {
      throw new Error(
        `Catalogue fiscal invalide: catégorie article dupliquée "${articleCategory}".`,
      );
    }
    seenArticleCategories.add(articleCategory);
    out.push({ articleCategory, familyCode, label });
  }
  return out;
}

export async function getSettings() {
  const repo = AppDataSource.getRepository(RestaurantSettings);
  const existing = await repo.findOne({ where: {} as any });
  const base = existing ? { ...defaults, ...existing } : { ...defaults };
  (base as any).posDiscountPresets = normalizePosDiscountPresets(
    (existing as any)?.posDiscountPresets ?? (base as any).posDiscountPresets,
  );
  (base as any).externalRestaurantCardApi = normalizeExternalRestaurantCardApi(
    (existing as any)?.externalRestaurantCardApi ??
      (base as any).externalRestaurantCardApi,
  );
  (base as any).clientTicketLayout = normalizeTicketLayout(
    (existing as any)?.clientTicketLayout ?? (base as any).clientTicketLayout,
  );
  (base as any).kitchenBarPrintTemplates = normalizeKitchenBarPrintTemplates(
    (existing as any)?.kitchenBarPrintTemplates ??
      (base as any).kitchenBarPrintTemplates,
  );
  (base as any).designerPrintTemplates = normalizeDesignerPrintTemplates(
    (existing as any)?.designerPrintTemplates ?? (base as any)?.designerPrintTemplates,
  );
  (base as any).printTemplateSource = normalizePrintTemplateSource(
    (existing as any)?.printTemplateSource ?? (base as any)?.printTemplateSource,
  );
  (base as any).receiptPdfDirectory = normalizeReceiptPdfDirectory(
    (existing as any)?.receiptPdfDirectory ?? (base as any).receiptPdfDirectory,
  );
  (base as any).paymentEnabledMethods = normalizePaymentEnabledMethods(
    (existing as any)?.paymentEnabledMethods ?? (base as any)?.paymentEnabledMethods,
  );
  (base as any).predefinedNotes = normalizePredefinedNotes(
    (existing as any)?.predefinedNotes ?? (base as any)?.predefinedNotes,
  );
  (base as any).tvaCatalog = normalizeTvaCatalog(
    (existing as any)?.tvaCatalog ?? (base as any)?.tvaCatalog,
    (base as any)?.tvaRate ?? (defaults as any).tvaRate,
  );
  (base as any).fiscalCategoryCatalog = normalizeFiscalCategoryCatalog(
    (existing as any)?.fiscalCategoryCatalog ?? (base as any)?.fiscalCategoryCatalog,
  );
  (base as any).clientKdsDisplayMode = normalizeClientKdsDisplayMode(
    (existing as any)?.clientKdsDisplayMode ?? (base as any).clientKdsDisplayMode,
  );
  (base as any).clientKdsWallboardMinWidthPx = normalizeClientKdsWallboardMinWidthPx(
    (existing as any)?.clientKdsWallboardMinWidthPx ??
      (base as any).clientKdsWallboardMinWidthPx,
  );
  (base as any).desktopPrintBridge = normalizeDesktopPrintBridge(
    (existing as any)?.desktopPrintBridge ?? (base as any)?.desktopPrintBridge,
  );
  const pref = normalizeCashClosingModePreference(
    (existing as any)?.cashClosingModePreference ??
      (base as any).cashClosingModePreference ??
      defaults.cashClosingModePreference,
  );
  (base as any).cashClosingModePreference = pref;
  try {
    const saasLicense = await getTenantLicenseSnapshot();
    if (saasLicense?.companyTypeManagedBySaas && saasLicense?.forcedCompanyType) {
      (base as any).companyType = normalizeCompanyType(saasLicense.forcedCompanyType);
    }
    (base as any).cashClosingMode = effectiveCashClosingMode(
      String((base as any).companyType || defaults.companyType),
      pref,
    );
    return { ...maskSensitiveSettings(base), saasLicense };
  } catch {
    (base as any).cashClosingMode = effectiveCashClosingMode(
      String((base as any).companyType || defaults.companyType),
      pref,
    );
    return maskSensitiveSettings(base);
  }
}

export async function saveSettings(incomingUpdate: any) {
  const lic = await ensureLicenseRow();
  const update = { ...(incomingUpdate || {}) };
  if (lic.companyTypeManagedBySaas) delete update.companyType;

  const repo = AppDataSource.getRepository(RestaurantSettings);
  const existing = await repo.findOne({ where: {} as any });
  const rawTicketPrefix = String(update?.ticketPrefix ?? existing?.ticketPrefix ?? defaults.ticketPrefix)
    .trim()
    .slice(0, 20);
  const rawInvoicePrefix = String(update?.invoicePrefix ?? existing?.invoicePrefix ?? defaults.invoicePrefix)
    .trim()
    .slice(0, 20);
  const rawClientPrefix = String(update?.clientPrefix ?? existing?.clientPrefix ?? defaults.clientPrefix)
    .trim()
    .slice(0, 20);
  const rawStockDocumentPrefix = String(update?.stockDocumentPrefix ?? existing?.stockDocumentPrefix ?? defaults.stockDocumentPrefix)
    .trim()
    .slice(0, 20);
  const rawProductPrefix = String(update?.productPrefix ?? existing?.productPrefix ?? defaults.productPrefix)
    .trim()
    .slice(0, 20);
  const existingDesktopBridgeToken = String(
    (existing as any)?.desktopPrintBridge?.token ??
      (defaults as any)?.desktopPrintBridge?.token ??
      '',
  ).trim();
  const incomingDesktopBridge = (update as any)?.desktopPrintBridge;
  const mergedDesktopBridge =
    incomingDesktopBridge === undefined
      ? (existing as any)?.desktopPrintBridge ?? (defaults as any)?.desktopPrintBridge
      : {
          ...(incomingDesktopBridge || {}),
          token: mergeSecretTokenInput(
            incomingDesktopBridge?.token,
            existingDesktopBridgeToken,
            '',
          ),
        };
  const existingExternalApiToken = String(
    (existing as any)?.externalRestaurantCardApi?.token ??
      (defaults as any)?.externalRestaurantCardApi?.token ??
      '',
  ).trim();
  const incomingExternalApi = (update as any)?.externalRestaurantCardApi;
  const mergedExternalApi =
    incomingExternalApi === undefined
      ? (existing as any)?.externalRestaurantCardApi ?? defaults.externalRestaurantCardApi
      : {
          ...(incomingExternalApi || {}),
          token: mergeSecretTokenInput(
            incomingExternalApi?.token,
            existingExternalApiToken,
            '',
          ),
        };
  const data = {
    ...defaults,
    ...(existing || {}),
    ...update,
    companyType: normalizeCompanyType(
      lic.companyTypeManagedBySaas
        ? lic.forcedCompanyType ?? existing?.companyType ?? defaults.companyType
        : update?.companyType ?? existing?.companyType ?? defaults.companyType,
    ),
    timbreValue: parseNumeric(update?.timbreValue ?? existing?.timbreValue ?? defaults.timbreValue),
    tvaRate: parseNumeric(update?.tvaRate ?? existing?.tvaRate ?? defaults.tvaRate),
    tvaCatalog:
      update?.tvaCatalog !== undefined
        ? normalizeTvaCatalog(
            update?.tvaCatalog,
            update?.tvaRate ?? existing?.tvaRate ?? defaults.tvaRate,
          )
        : normalizeTvaCatalog(
            (existing as any)?.tvaCatalog ?? (defaults as any).tvaCatalog,
            update?.tvaRate ?? existing?.tvaRate ?? defaults.tvaRate,
          ),
    fiscalCategoryCatalog:
      update?.fiscalCategoryCatalog !== undefined
        ? validateFiscalCategoryCatalogOrThrow(update?.fiscalCategoryCatalog)
        : normalizeFiscalCategoryCatalog(
            (existing as any)?.fiscalCategoryCatalog ?? (defaults as any).fiscalCategoryCatalog,
          ),
    applyTvaToTicket: update?.applyTvaToTicket ?? existing?.applyTvaToTicket ?? defaults.applyTvaToTicket,
    applyTvaToInvoice: update?.applyTvaToInvoice ?? existing?.applyTvaToInvoice ?? defaults.applyTvaToInvoice,
    applyTimbreToTicket: update?.applyTimbreToTicket ?? existing?.applyTimbreToTicket ?? defaults.applyTimbreToTicket,
    applyTimbreToInvoice: update?.applyTimbreToInvoice ?? existing?.applyTimbreToInvoice ?? defaults.applyTimbreToInvoice,
    printPreviewOnValidate: update?.printPreviewOnValidate ?? existing?.printPreviewOnValidate ?? defaults.printPreviewOnValidate,
    printAutoOnPreview: update?.printAutoOnPreview ?? existing?.printAutoOnPreview ?? defaults.printAutoOnPreview,
    printRoutingMode: normalizePrintRoutingMode(
      update?.printRoutingMode ??
        (existing as any)?.printRoutingMode ??
        defaults.printRoutingMode,
    ),
    nacefEnabled: Boolean(
      update?.nacefEnabled ??
        (existing as any)?.nacefEnabled ??
        (defaults as any)?.nacefEnabled ??
        false,
    ),
    nacefEnforcementMode: normalizeNacefEnforcementMode(
      update?.nacefEnforcementMode ??
        (existing as any)?.nacefEnforcementMode ??
        (defaults as any)?.nacefEnforcementMode ??
        'SOFT',
    ),
    nacefMode: normalizeNacefMode(
      update?.nacefMode ??
        (existing as any)?.nacefMode ??
        (defaults as any)?.nacefMode ??
        'SIMULATED',
    ),
    nacefImdf: normalizeNacefImdf(
      update?.nacefImdf ??
        (existing as any)?.nacefImdf ??
        (defaults as any)?.nacefImdf ??
        '',
    ),
    nacefBaseUrl: normalizeNacefBaseUrl(
      update?.nacefBaseUrl ??
        (existing as any)?.nacefBaseUrl ??
        (defaults as any)?.nacefBaseUrl,
    ),
    desktopPrintBridge: normalizeDesktopPrintBridge(
      mergedDesktopBridge,
    ),
    touchUiMode: update?.touchUiMode ?? existing?.touchUiMode ?? defaults.touchUiMode,
    clientKdsDisplayMode: normalizeClientKdsDisplayMode(
      update?.clientKdsDisplayMode ??
        existing?.clientKdsDisplayMode ??
        defaults.clientKdsDisplayMode,
    ),
    clientKdsWallboardMinWidthPx: normalizeClientKdsWallboardMinWidthPx(
      update?.clientKdsWallboardMinWidthPx ??
        (existing as any)?.clientKdsWallboardMinWidthPx ??
        defaults.clientKdsWallboardMinWidthPx,
    ),
    roomDisplayMode: normalizeRoomDisplayMode(
      update?.roomDisplayMode ??
        (existing as any)?.roomDisplayMode ??
        defaults.roomDisplayMode,
    ),
    clientTicketPrintCopies: Math.max(
      1,
      Math.min(
        10,
        Math.floor(
          parseNumeric(
            update?.clientTicketPrintCopies ??
              existing?.clientTicketPrintCopies ??
              defaults.clientTicketPrintCopies,
          ),
        ),
      ),
    ),
    clientTicketTemplate: normalizeTicketTemplate(
      update?.clientTicketTemplate ??
        existing?.clientTicketTemplate ??
        defaults.clientTicketTemplate,
    ),
    clientTicketLayout: normalizeTicketLayout(
      update?.clientTicketLayout ??
        (existing as any)?.clientTicketLayout ??
        defaults.clientTicketLayout,
    ),
    kitchenBarPrintTemplates: normalizeKitchenBarPrintTemplates(
      update?.kitchenBarPrintTemplates ??
        (existing as any)?.kitchenBarPrintTemplates ??
        defaults.kitchenBarPrintTemplates,
    ),
    designerPrintTemplates: normalizeDesignerPrintTemplates(
      update?.designerPrintTemplates ??
        (existing as any)?.designerPrintTemplates ??
        (defaults as any)?.designerPrintTemplates,
    ),
    printTemplateSource: normalizePrintTemplateSource(
      (update as any)?.printTemplateSource ??
        (existing as any)?.printTemplateSource ??
        (defaults as any)?.printTemplateSource,
    ),
    receiptPdfDirectory: normalizeReceiptPdfDirectory(
      update?.receiptPdfDirectory ??
        (existing as any)?.receiptPdfDirectory ??
        defaults.receiptPdfDirectory,
    ),
    autoDownloadReceiptPdfOnClient:
      update?.autoDownloadReceiptPdfOnClient ??
      (existing as any)?.autoDownloadReceiptPdfOnClient ??
      defaults.autoDownloadReceiptPdfOnClient,
    preventSaleOnInsufficientStock:
      update?.preventSaleOnInsufficientStock ??
      existing?.preventSaleOnInsufficientStock ??
      defaults.preventSaleOnInsufficientStock,
    ticketPrefix: rawTicketPrefix,
    ticketSequence: Number(existing?.ticketSequence ?? defaults.ticketSequence) || 0,
    invoicePrefix: rawInvoicePrefix,
    invoiceSequence: Number(existing?.invoiceSequence ?? defaults.invoiceSequence) || 0,
    clientPrefix: rawClientPrefix,
    clientSequence: Number(existing?.clientSequence ?? defaults.clientSequence) || 0,
    stockDocumentPrefix: rawStockDocumentPrefix,
    stockDocumentSequence:
      Number(existing?.stockDocumentSequence ?? defaults.stockDocumentSequence) || 0,
    productPrefix: rawProductPrefix,
    productSequence: Number(existing?.productSequence ?? defaults.productSequence) || 0,
    posDiscountPresets:
      update?.posDiscountPresets !== undefined
        ? normalizePosDiscountPresets(update.posDiscountPresets)
        : normalizePosDiscountPresets(
            (existing as any)?.posDiscountPresets ?? defaults.posDiscountPresets,
          ),
    externalRestaurantCardApi:
      update?.externalRestaurantCardApi !== undefined
        ? normalizeExternalRestaurantCardApi(mergedExternalApi)
        : normalizeExternalRestaurantCardApi(
            (existing as any)?.externalRestaurantCardApi ??
              defaults.externalRestaurantCardApi,
          ),
    paymentEnabledMethods:
      update?.paymentEnabledMethods !== undefined
        ? normalizePaymentEnabledMethods(update.paymentEnabledMethods)
        : normalizePaymentEnabledMethods(
            (existing as any)?.paymentEnabledMethods ?? defaults.paymentEnabledMethods,
          ),
    predefinedNotes:
      update?.predefinedNotes !== undefined
        ? normalizePredefinedNotes(update.predefinedNotes)
        : normalizePredefinedNotes(
            (existing as any)?.predefinedNotes ?? defaults.predefinedNotes,
          ),
    cashClosingModePreference: normalizeCashClosingModePreference(
      update?.cashClosingModePreference ??
        (existing as any)?.cashClosingModePreference ??
        defaults.cashClosingModePreference,
    ),
  } as any;

  const entity = existing ? Object.assign(existing, data) : repo.create(data);
  await repo.save(entity as any);
  return getSettings();
}
