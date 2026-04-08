import { AppDataSource } from '../data-source.js';
import { RestaurantSettings } from '../entity/RestaurantSettings.js';
import { ensureLicenseRow, getTenantLicenseSnapshot } from './saasLicenseService.js';

const defaultPosDiscountPresets = [
  { id: 'preset-fidelite', label: 'Fidélité', type: 'PERCENT' as const, value: 10 },
  { id: 'preset-staff', label: 'Staff', type: 'PERCENT' as const, value: 50 },
  { id: 'preset-vip', label: 'Offert VIP', type: 'PERCENT' as const, value: 100 },
];

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
  applyTvaToTicket: true,
  applyTvaToInvoice: true,
  applyTimbreToTicket: true,
  applyTimbreToInvoice: true,
  printPreviewOnValidate: false,
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
  (base as any).receiptPdfDirectory = normalizeReceiptPdfDirectory(
    (existing as any)?.receiptPdfDirectory ?? (base as any).receiptPdfDirectory,
  );
  (base as any).paymentEnabledMethods = normalizePaymentEnabledMethods(
    (existing as any)?.paymentEnabledMethods ?? (base as any)?.paymentEnabledMethods,
  );
  (base as any).predefinedNotes = normalizePredefinedNotes(
    (existing as any)?.predefinedNotes ?? (base as any)?.predefinedNotes,
  );
  (base as any).clientKdsDisplayMode = normalizeClientKdsDisplayMode(
    (existing as any)?.clientKdsDisplayMode ?? (base as any).clientKdsDisplayMode,
  );
  (base as any).clientKdsWallboardMinWidthPx = normalizeClientKdsWallboardMinWidthPx(
    (existing as any)?.clientKdsWallboardMinWidthPx ??
      (base as any).clientKdsWallboardMinWidthPx,
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
    return { ...base, saasLicense };
  } catch {
    (base as any).cashClosingMode = effectiveCashClosingMode(
      String((base as any).companyType || defaults.companyType),
      pref,
    );
    return base;
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
    applyTvaToTicket: update?.applyTvaToTicket ?? existing?.applyTvaToTicket ?? defaults.applyTvaToTicket,
    applyTvaToInvoice: update?.applyTvaToInvoice ?? existing?.applyTvaToInvoice ?? defaults.applyTvaToInvoice,
    applyTimbreToTicket: update?.applyTimbreToTicket ?? existing?.applyTimbreToTicket ?? defaults.applyTimbreToTicket,
    applyTimbreToInvoice: update?.applyTimbreToInvoice ?? existing?.applyTimbreToInvoice ?? defaults.applyTimbreToInvoice,
    printPreviewOnValidate: update?.printPreviewOnValidate ?? existing?.printPreviewOnValidate ?? defaults.printPreviewOnValidate,
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
        ? normalizeExternalRestaurantCardApi(update.externalRestaurantCardApi)
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
