import { getSettings } from './settingsService.js';
import * as nacefService from './nacefService.js';
import { AppDataSource } from '../data-source.js';
import { TicketItem } from '../entity/TicketItem.js';
import { Product } from '../entity/Product.js';

type ProductTaxMeta = { rate: number; code: string };
type FiscalLine = {
  lineNo: number;
  productId: string;
  name: string;
  quantity: string;
  unitPriceHt: string;
  lineHt: string;
  lineTax: string;
  lineTtc: string;
  taxRate: string;
  taxCode: string | null;
  familyCode: string | null;
};

function parseAmount(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function toFixed3(value: unknown) {
  return parseAmount(value).toFixed(3);
}

function resolveLineTaxRate(line: any, defaultRate: number) {
  const inlineRate = parseAmount(line?.taxRate ?? line?.tvaRate ?? line?.vatRate);
  if (inlineRate > 0) return inlineRate;
  const productRate = parseAmount(line?.productTaxRate);
  if (productRate > 0) return productRate;
  const settingsRate = parseAmount(line?.settingsTaxRate);
  if (settingsRate > 0) return settingsRate;
  return Math.max(0, defaultRate);
}

async function computeTicketHt(ticket: any) {
  const inlineItems = Array.isArray(ticket?.items) ? ticket.items : [];
  if (inlineItems.length > 0) {
    return inlineItems.reduce((sum: number, it: any) => sum + parseAmount(it?.total), 0);
  }
  const ticketId = String(ticket?.id || '').trim();
  if (!ticketId) return parseAmount(ticket?.total);
  try {
    const repo = AppDataSource.getRepository(TicketItem);
    const dbItems = await repo.find({ where: { ticket: { id: ticketId } } as any });
    if (dbItems.length > 0) {
      return dbItems.reduce((sum, it: any) => sum + parseAmount(it?.total), 0);
    }
  } catch {
    // fallback below
  }
  return parseAmount(ticket?.total);
}

async function loadTicketLines(ticket: any) {
  const inlineItems = Array.isArray(ticket?.items) ? ticket.items : [];
  if (inlineItems.length > 0) return inlineItems;
  const ticketId = String(ticket?.id || '').trim();
  if (!ticketId) return [];
  try {
    const repo = AppDataSource.getRepository(TicketItem);
    return await repo.find({ where: { ticket: { id: ticketId } } as any });
  } catch {
    return [];
  }
}

function buildSettingsTaxMap(settings: any) {
  const raw = Array.isArray((settings as any)?.tvaCatalog) ? (settings as any).tvaCatalog : [];
  const map = new Map<string, number>();
  for (const entry of raw) {
    const code = String(entry?.code || '').trim().toUpperCase();
    const rate = parseAmount(entry?.rate);
    if (code && rate >= 0) map.set(code, rate);
  }
  return map;
}

async function loadProductTaxMap(lines: any[]) {
  const productIds = Array.from(
    new Set(
      (lines || [])
        .map((line) => String(line?.productId || '').trim())
        .filter((id) => id.length > 0),
    ),
  );
  if (productIds.length === 0) return new Map<string, ProductTaxMeta>();
  const repo = AppDataSource.getRepository(Product);
  const products = await repo.findBy(productIds.map((id) => ({ id })) as any);
  const map = new Map<string, ProductTaxMeta>();
  for (const p of products as any[]) {
    map.set(String(p.id), {
      rate: parseAmount(p.taxRate),
      code: String(p.taxCode || '').trim().toUpperCase(),
    });
  }
  return map;
}

function buildSettingsFiscalFamilyMap(settings: any) {
  const raw = Array.isArray((settings as any)?.fiscalCategoryCatalog)
    ? (settings as any).fiscalCategoryCatalog
    : [];
  const map = new Map<string, string>();
  for (const entry of raw) {
    const articleCategory = String(
      entry?.articleCategory ?? entry?.productCategory ?? entry?.category ?? '',
    ).trim();
    const familyCode = String(entry?.familyCode ?? entry?.code ?? '').trim().toUpperCase();
    if (articleCategory && familyCode) map.set(articleCategory, familyCode);
  }
  return map;
}

function resolveTransactionType(ticket: any): 'NORMAL' | 'FORMATION' | 'REMBOURSEMENT' | 'COPIE' {
  const rawType = String(ticket?.transactionType || ticket?.type || '').trim().toUpperCase();
  if (rawType === 'FORMATION' || ticket?.isTraining === true) return 'FORMATION';
  if (rawType === 'COPIE' || ticket?.isCopy === true || ticket?.copyOfTicketId) return 'COPIE';
  if (
    rawType === 'REMBOURSEMENT' ||
    rawType === 'REFUND' ||
    String(ticket?.operationType || '').trim().toUpperCase() === 'REFUND' ||
    parseAmount(ticket?.total) < 0
  ) {
    return 'REMBOURSEMENT';
  }
  return 'NORMAL';
}

function resolveImdf(settings: any) {
  return String(settings?.nacefImdf || '').trim().toUpperCase();
}

function resolveEnforcementMode(settings: any): 'SOFT' | 'HARD' {
  const raw = String(settings?.nacefEnforcementMode || 'SOFT').trim().toUpperCase();
  return raw === 'HARD' ? 'HARD' : 'SOFT';
}

function toMillis(value: unknown) {
  return Math.round(parseAmount(value) * 1000);
}
function buildFullOrderQrPayload(args: {
  ticket: any;
  settings: any;
  imdf: string;
  payload: any;
  fiscalLines: FiscalLine[];
  taxBreakdown: Array<{ taxRate: string; taxableBase: string; taxAmount: string }>;
  nacefTicket: any;
  signedTicket?: any;
}) {
  const { ticket, settings, imdf, payload, fiscalLines, taxBreakdown, nacefTicket, signedTicket } = args;
  return JSON.stringify({
    schema: 'NACEF_ORDER_QR_V1',
    ticketCode: String(ticket?.code || ticket?.id || ''),
    issuedAt: Number(ticket?.createdAt || Date.now()),
    imdf: String(imdf || ''),
    restaurant: {
      name: String((settings as any)?.restaurantName || ''),
      taxId: String((settings as any)?.taxId || ''),
      currency: String((settings as any)?.currency || 'DT'),
    },
    sale: {
      operationType: String(payload?.operationType || 'SALE'),
      transactionType: String(payload?.transactionType || 'NORMAL'),
      totalHt: String(payload?.totalHt || '0.000'),
      taxTotal: String(payload?.taxTotal || '0.000'),
      totalTtc: String(payload?.totalTtc || '0.000'),
      taxRate: String(payload?.taxRate || '0.000'),
      taxBreakdown,
    },
    lines: fiscalLines.map((line) => ({
      lineNo: line.lineNo,
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      unitPriceHt: line.unitPriceHt,
      lineHt: line.lineHt,
      lineTax: line.lineTax,
      lineTtc: line.lineTtc,
      taxRate: line.taxRate,
      taxCode: line.taxCode,
      familyCode: line.familyCode,
    })),
    nacef: {
      transactionId: String(nacefTicket?.transaction?.id || payload?.id || ''),
      transactionTimestamp: String(nacefTicket?.transaction?.timestamp || ''),
      mode: String((signedTicket as any)?.mode || ''),
      signature: String((signedTicket as any)?.signature || ''),
      officialQr: String((signedTicket as any)?.qrCodePayload || ''),
    },
  });
}

function buildNacefTicketSchema(args: {
  ticket: any;
  settings: any;
  imdf: string;
  fiscalLines: FiscalLine[];
  taxBreakdown: Array<{ taxRate: string; taxableBase: string; taxAmount: string }>;
  totalHt: number;
  taxTotal: number;
  totalTtc: number;
  transactionType: 'NORMAL' | 'FORMATION' | 'REMBOURSEMENT' | 'COPIE';
}) {
  const { ticket, settings, imdf, fiscalLines, taxBreakdown, totalHt, taxTotal, totalTtc, transactionType } = args;
  const txId = String(ticket?.code || ticket?.id || `TK-${Date.now()}`);
  const opType =
    transactionType === 'REMBOURSEMENT'
      ? 'REFUND'
      : transactionType === 'COPIE'
        ? 'DUPLICATE'
        : 'TICKET';
  const context = transactionType === 'FORMATION' ? 'TRAINING' : 'SALE';
  const nowIso = new Date(Number(ticket?.createdAt || Date.now())).toISOString();
  const saleDetails = fiscalLines.map((line) => ({
    product: {
      family_code: String(line.familyCode || 'NA'),
      name: String(line.name || 'Article'),
      price_pre_tax: toMillis(line.unitPriceHt),
    },
    taxation: [
      {
        type: 'percent',
        value: Number(line.taxRate),
        tax_code: String(line.taxCode || 'TVA_STD'),
      },
    ],
    quantity: Number(line.quantity),
    discount_per_unit: { percent: 0, value: 0 },
  }));
  const taxSummary = taxBreakdown.map((row, index) => ({
    tax_code: `TVA_${index + 1}`,
    total_amount: toMillis(row.taxAmount),
  }));
  return {
    data_type: 'ncf.cashier.operation',
    version: '1.1.4',
    transaction: {
      id: txId,
      timestamp: nowIso,
      operation: {
        op_type: opType,
        context,
      },
      originator: {
        agent_identifier: String(settings?.terminalId || settings?.restaurantName || 'POS-AGENT').slice(0, 32),
        imdf: imdf,
        cash_register_serialnumber: String(settings?.terminalId || 'POS-SERIAL-001').slice(0, 32),
        cash_register_software: 'AXIAFLEX_POS',
        accreditation_reference: 'ACC-AXIAFLEX',
      },
    },
    merchant_identity: {
      id: String(settings?.taxId || '').trim(),
      id_type: 'MF',
      taxpayer_establishment: {
        commercial_name: String(settings?.restaurantName || 'Etablissement'),
        reference: '000',
        address: String(settings?.address || 'Adresse non renseignee'),
        city: 'TUNIS',
      },
    },
    sale_details: saleDetails,
    tax_summary: taxSummary,
    general_discount: { percent: 0, value: 0 },
    additional_tax: { type: 'percent', value: 0, tax_code: 'NONE' },
    payment_details: {
      collection_details: [
        {
          method: String(ticket?.paymentMethod || 'cash').toLowerCase(),
          amount: toMillis(totalTtc),
        },
      ],
      returned_change: [],
    },
    sale_summary: {
      total_excl_tax: toMillis(totalHt),
      total_incl_tax: toMillis(totalTtc),
      total_tax: toMillis(taxTotal),
    },
    delivery_details: {
      type: 'SELF_PICKUP',
    },
  };
}

export async function maybeFiscalizeTicket(ticket: any) {
  const settings = await getSettings();
  const enabled = Boolean((settings as any)?.nacefEnabled);
  const enforcementMode = resolveEnforcementMode(settings);
  const imdf = resolveImdf(settings);
  if (!ticket || !enabled) {
    return ticket;
  }
  if (!imdf) {
    (ticket as any).fiscalStatus = 'REJECTED';
    (ticket as any).fiscalErrorCode = 'NACEF_IMDF_MISSING';
    (ticket as any).fiscalMode = null;
    (ticket as any).fiscalQrPayload = '';
    (ticket as any).fiscalSignature = '';
    (ticket as any).fiscalPayloadJson = null;
    if (enforcementMode === 'HARD') {
      throw new Error("Configuration NACEF invalide: IMDF manquant dans les paramètres.");
    }
    return ticket;
  }

  const transactionType = resolveTransactionType(ticket);
  const totalHtNum = Math.abs(await computeTicketHt(ticket));
  const discountNum = Math.max(0, parseAmount(ticket?.discount));
  const timbreNum = Math.max(0, parseAmount(ticket?.timbre));
  const defaultTvaRate = Math.max(0, parseAmount((settings as any)?.tvaRate));
  const settingsTaxMap = buildSettingsTaxMap(settings);
  const fiscalFamilyMap = buildSettingsFiscalFamilyMap(settings);
  const applyTva = Boolean((settings as any)?.applyTvaToTicket);
  const ticketLines = await loadTicketLines(ticket);
  const productTaxMap = await loadProductTaxMap(ticketLines);
  for (const [index, line] of ticketLines.entries()) {
    const productId = String(line?.productId || '').trim();
    const productTaxMeta = productTaxMap.get(productId) || { rate: 0, code: '' };
    const resolvedTaxCode = String(line?.taxCode || productTaxMeta.code || '').trim().toUpperCase();
    if (resolvedTaxCode && !settingsTaxMap.has(resolvedTaxCode)) {
      const lineName = String(line?.name || '').trim() || `Article ${index + 1}`;
      throw new Error(
        `Taxe invalide pour "${lineName}": le code TVA "${resolvedTaxCode}" n'existe pas dans le catalogue TVA (A4/A5).`,
      );
    }
  }
  const fiscalLines: FiscalLine[] = ticketLines
    .map((line: any, index: number) => {
      const productId = String(line?.productId || '').trim();
      const productTaxMeta = productTaxMap.get(productId) || { rate: 0, code: '' };
      const productCategory = String((line as any)?.category || '').trim();
      const resolvedFamilyCode = String(
        (line as any)?.familyCode || fiscalFamilyMap.get(productCategory) || '',
      )
        .trim()
        .toUpperCase();
      const resolvedTaxCode = String(line?.taxCode || productTaxMeta.code || '').trim().toUpperCase();
      const settingsTaxRate = resolvedTaxCode ? parseAmount(settingsTaxMap.get(resolvedTaxCode)) : 0;
      const productTaxRate = parseAmount(productTaxMeta.rate);
      const quantity = Math.max(0, parseAmount(line?.quantity));
      const unitPriceHt = Math.max(0, parseAmount(line?.unitPrice));
      const lineHt = Math.max(0, parseAmount(line?.total));
      const lineRate = resolveLineTaxRate(
        { ...line, productTaxRate, settingsTaxRate },
        defaultTvaRate,
      );
      const discountShare = totalHtNum > 0 ? (lineHt / totalHtNum) * discountNum : 0;
      const taxableLineHt = Math.max(0, lineHt - discountShare);
      const lineTax = applyTva && lineRate > 0 ? (taxableLineHt * lineRate) / 100 : 0;
      const lineTtc = taxableLineHt + lineTax;
      return {
        lineNo: index + 1,
        productId,
        name: String(line?.name || '').trim() || `Article ${index + 1}`,
        quantity: toFixed3(quantity),
        unitPriceHt: toFixed3(unitPriceHt),
        lineHt: toFixed3(taxableLineHt),
        lineTax: toFixed3(lineTax),
        lineTtc: toFixed3(lineTtc),
        taxRate: toFixed3(lineRate),
        taxCode: resolvedTaxCode || null,
        familyCode: resolvedFamilyCode || null,
      };
    })
    .filter((line: FiscalLine) => parseAmount(line.lineHt) > 0);
  const taxableBase = fiscalLines.reduce((sum, line) => sum + parseAmount(line.lineHt), 0);
  const taxTotalNum = fiscalLines.reduce((sum, line) => sum + parseAmount(line.lineTax), 0);
  const totalTtcNum = taxableBase + taxTotalNum + timbreNum;
  const taxBreakdownMap = new Map<string, { taxRate: string; taxableBase: number; taxAmount: number }>();
  for (const line of fiscalLines) {
    const rate = String(line.taxRate || '0.000');
    const bucket = taxBreakdownMap.get(rate) || { taxRate: rate, taxableBase: 0, taxAmount: 0 };
    bucket.taxableBase += parseAmount(line.lineHt);
    bucket.taxAmount += parseAmount(line.lineTax);
    taxBreakdownMap.set(rate, bucket);
  }
  const taxBreakdown = Array.from(taxBreakdownMap.values()).map((b) => ({
    taxRate: b.taxRate,
    taxableBase: toFixed3(b.taxableBase),
    taxAmount: toFixed3(b.taxAmount),
  }));
  const distinctRates = Array.from(new Set(fiscalLines.map((line: FiscalLine) => String(line.taxRate))));
  const payloadTaxRate = distinctRates.length === 1 ? distinctRates[0] : '0.000';
  const payload = {
    id: String(ticket?.code || ticket?.id || `TK-${Date.now()}`),
    operationType: transactionType === 'REMBOURSEMENT' ? 'REFUND' : 'SALE',
    transactionType,
    totalHt: toFixed3(taxableBase),
    taxTotal: toFixed3(taxTotalNum),
    totalTtc: toFixed3(totalTtcNum),
    taxRate: payloadTaxRate,
    currency: String((settings as any)?.currency || 'DT').trim() || 'DT',
    sellerTaxId: String((settings as any)?.taxId || '').trim(),
    issuedAt: Number(ticket?.createdAt || Date.now()),
    fiscalLines,
    taxBreakdown,
  };
  const nacefTicket = buildNacefTicketSchema({
    ticket,
    settings,
    imdf,
    fiscalLines,
    taxBreakdown,
    totalHt: taxableBase,
    taxTotal: taxTotalNum,
    totalTtc: totalTtcNum,
    transactionType,
  });
  (ticket as any).fiscalPayloadJson = JSON.stringify(nacefTicket);

  const signed = await nacefService.signTicket(imdf, payload);
  (ticket as any).fiscalImdf = imdf;

  if ((signed as any)?.errorCode) {
    (ticket as any).fiscalStatus = 'REJECTED';
    (ticket as any).fiscalErrorCode = String((signed as any).errorCode);
    (ticket as any).fiscalMode = null;
    (ticket as any).fiscalQrPayload = '';
    (ticket as any).fiscalSignature = '';
    if (enforcementMode === 'HARD') {
      throw new Error(`Fiscalisation NACEF bloquante: ${(signed as any).errorCode}`);
    }
    return ticket;
  }

  const signedTicket = (signed as any)?.signedTicket || {};
  (ticket as any).fiscalStatus = 'SIGNED';
  (ticket as any).fiscalMode = String(signedTicket?.mode || 'ONLINE');
  (ticket as any).fiscalQrPayload = buildFullOrderQrPayload({
    ticket,
    settings,
    imdf,
    payload,
    fiscalLines,
    taxBreakdown,
    nacefTicket,
    signedTicket,
  });
  (ticket as any).fiscalSignature = String(signedTicket?.signature || '');
  (ticket as any).fiscalErrorCode = null;
  return ticket;
}

