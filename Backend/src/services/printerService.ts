import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import PDFDocument from 'pdfkit';
import { AppDataSource } from '../data-source.js';
import { In } from 'typeorm';
import { Printer } from '../entity/Printer.js';
import { Product } from '../entity/Product.js';
import { Ticket } from '../entity/Ticket.js';
import { TicketItem } from '../entity/TicketItem.js';
import { OrderItem } from '../entity/OrderItem.js';
import { User } from '../entity/User.js';
import { getSettings } from './settingsService.js';
import { savePdfArchiveFromFile } from './pdfArchiveService.js';
import { enqueuePrintJob } from './printJobService.js';

const execFileAsync = promisify(execFile);

/** Nom de file d’attente Windows si le serveur de la commande a une imprimante affectée. */
async function resolvePhysicalPrinterNameForOrderServer(
	order: any,
): Promise<string | null> {
	const sid =
		order?.serverId != null ? String(order.serverId).trim() : '';
	if (!sid) return null;
	try {
		const userRepo = AppDataSource.getRepository(User);
		const user = await userRepo.findOneBy({ id: sid } as any);
		const pid = user?.assignedPrinterId
			? String(user.assignedPrinterId).trim()
			: '';
		if (!pid) return null;
		const printerRepo = AppDataSource.getRepository(Printer);
		const pr = await printerRepo.findOneBy({ id: pid } as any);
		const n = String(pr?.name || '').trim();
		return n || null;
	} catch {
		return null;
	}
}

export async function listPrinters() {
	const repo = AppDataSource.getRepository(Printer);
	return repo.find();
}

function normalizeBonProfile(raw: string | null | undefined): string | null {
	const v = String(raw || '')
		.trim()
		.toLowerCase();
	if (v === 'bar') return 'bar';
	if (v === 'kitchen') return 'kitchen';
	return null;
}

export async function createPrinter(
	name: string,
	type: string,
	bonProfile?: string | null,
) {
	const repo = AppDataSource.getRepository(Printer);
	const t = String(type || '').trim();
	const upper = t.toUpperCase();
	if (upper === 'RECEIPT') {
		const p = repo.create({
			name: String(name || '').trim(),
			type: 'RECEIPT',
			bonProfile: null,
		} as any);
		return repo.save(p as any);
	}
	if (!t) throw new Error('Libellé du poste requis (ex. Cuisine, Bar, Terrasse).');
	const bp =
		normalizeBonProfile(bonProfile) || (upper === 'BAR' ? 'bar' : 'kitchen');
	const p = repo.create({
		name: String(name || '').trim(),
		type: t.slice(0, 120),
		bonProfile: bp,
	} as any);
	return repo.save(p as any);
}

export async function updatePrinter(
	id: string,
	updates: {
		name?: string;
		type?: string;
		bonProfile?: string | null;
	},
) {
	const repo = AppDataSource.getRepository(Printer);
	const existing = await repo.findOneBy({ id } as any);
	if (!existing) return null;
	const nextName = String((updates?.name ?? existing.name) || '').trim();
	if (!nextName) throw new Error('Nom imprimante requis.');
	const nextTypeRaw = String((updates?.type ?? existing.type) || '').trim();
	const nextTypeUpper = nextTypeRaw.toUpperCase();
	if (!nextTypeRaw) throw new Error('Type imprimante requis.');
	if (nextTypeUpper === 'RECEIPT') {
		(existing as any).name = nextName;
		(existing as any).type = 'RECEIPT';
		(existing as any).bonProfile = null;
		return repo.save(existing as any);
	}
	const nextBonProfile =
		normalizeBonProfile(updates?.bonProfile) ||
		normalizeBonProfile((existing as any).bonProfile) ||
		(nextTypeUpper === 'BAR' ? 'bar' : 'kitchen');
	(existing as any).name = nextName;
	(existing as any).type = nextTypeRaw.slice(0, 120);
	(existing as any).bonProfile = nextBonProfile;
	return repo.save(existing as any);
}

/** Style de bon pour une imprimante production (héritage type BAR / KITCHEN). */
export function resolvePrinterBonProfile(printer: any): 'kitchen' | 'bar' {
	if (!printer) return 'kitchen';
	const pType = String((printer as any).type || '').toUpperCase();
	if (pType === 'RECEIPT') return 'kitchen';
	const b = normalizeBonProfile((printer as any).bonProfile);
	if (b === 'bar') return 'bar';
	if (b === 'kitchen') return 'kitchen';
	if (pType === 'BAR') return 'bar';
	return 'kitchen';
}

export async function deletePrinter(id: string) {
	const repo = AppDataSource.getRepository(Printer);
	const existing = await repo.findOneBy({ id } as any);
	if (!existing) return false;
	await repo.remove(existing as any);
	return true;
}

export async function listDetectedPrinters() {
	if (process.platform === 'win32') {
		try {
			const psScript =
				"$items = @(); " +
				"try { $items += Get-Printer | Select-Object Name,DriverName,PortName,Shared,ShareName,ComputerName,Type,Comment } catch {}; " +
				"try { $items += Get-CimInstance Win32_Printer | Select-Object @{n='Name';e={$_.Name}},@{n='DriverName';e={$_.DriverName}},@{n='PortName';e={$_.PortName}},@{n='Shared';e={$_.Shared}},@{n='ShareName';e={$_.ShareName}},@{n='ComputerName';e={$_.SystemName}},@{n='Type';e={$_.PrinterStatus}},@{n='Comment';e={$_.Comment}} } catch {}; " +
				"$dedup = $items | Where-Object { $_.Name } | Group-Object Name | ForEach-Object { $_.Group | Select-Object -First 1 }; " +
				"$dedup | ConvertTo-Json -Compress";
			const { stdout } = await execFileAsync('powershell', [
				'-NoProfile',
				'-ExecutionPolicy',
				'Bypass',
				'-Command',
				psScript,
			]);
			const text = (stdout || '').trim();
			if (!text) return [];
			const data = JSON.parse(text);
			return Array.isArray(data) ? data : [data];
		} catch {
			return [];
		}
	}
	// Linux fallback (CUPS): returns printer queues if available on host.
	try {
		const { stdout } = await execFileAsync('lpstat', ['-v']);
		const lines = String(stdout || '')
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean);
		return lines.map((line) => {
			// Example: "device for HP_LaserJet: socket://192.168.1.50"
			const m = line.match(/^device for\s+(.+?):\s+(.+)$/i);
			const name = m?.[1] ? String(m[1]).trim() : line;
			const port = m?.[2] ? String(m[2]).trim() : '';
			return {
				Name: name,
				DriverName: 'CUPS',
				PortName: port,
				Shared: false,
				ShareName: null,
			};
		});
	} catch {
		return [];
	}
}

type PrintItem = {
	productId?: string;
	name?: string;
	quantity?: number;
	notes?: string;
  unitPrice?: number;
};

const THERMAL_LINE_WIDTH = 32;
const padRight = (value: string, width: number) => {
  const s = String(value || '');
  if (s.length >= width) return s;
  return `${s}${' '.repeat(width - s.length)}`;
};
const padLeft = (value: string, width: number) => {
  const s = String(value || '');
  if (s.length >= width) return s;
  return `${' '.repeat(width - s.length)}${s}`;
};
const clampText = (value: string, width: number) => {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (s.length <= width) return s;
  if (width <= 3) return s.slice(0, width);
  return `${s.slice(0, width - 3)}...`;
};
const formatMoney3 = (value: number) => Number(value || 0).toFixed(3);
const makeSeparator = (ch = '-') => ch.repeat(THERMAL_LINE_WIDTH);
const centerLine = (value: string) => {
  const s = clampText(String(value || ''), THERMAL_LINE_WIDTH);
  const left = Math.max(0, Math.floor((THERMAL_LINE_WIDTH - s.length) / 2));
  return `${' '.repeat(left)}${s}`;
};

const formatLine = (item: PrintItem) => {
	const qty = Number(item.quantity || 0);
	const name = item.name || 'Article';
	const notes = item.notes ? ` (${item.notes})` : '';
	return `- ${name} x${qty}${notes}`;
};

const formatLineWithTemplate = (item: PrintItem, tpl: any) => {
	const qty = Number(item.quantity || 0);
	const name = String(item.name || 'Article');
	const qtyPrefix = tpl?.showItemQty !== false ? `${qty}x ` : '';
	const main = `- ${clampText(`${qtyPrefix}${name}`.trim(), 28)}`.trimEnd();
	const notesLine =
		tpl?.showItemNotes !== false && item.notes
      ? `  * ${clampText(String(item.notes), THERMAL_LINE_WIDTH - 4)}`
      : '';
	return [main, notesLine].filter(Boolean).join('\n');
};

const BAR_KEYWORDS_RE =
  /(eau|coca|cola|fanta|sprite|jus|boisson|soda|cafe|café|the|thé|espresso|capuccino|mojito|biere|bière|vin|canette|cocktail)/i;
const FOOD_CATEGORY_RE =
  /(sandwich|burger|pizza|pates|pâtes|plat|grill|menu|food|cuisine|kitchen|snack|wrap|panini|tacos|shawarma)/i;
const DRINK_CATEGORY_RE =
  /(drink|boisson|bar|jus|cafe|café|soda|cocktail|eau|cola|the|thé|vin|biere|bière)/i;
const inferProductionProfile = (item: PrintItem): 'bar' | 'kitchen' => {
  const station = String((item as any)?.station || '')
    .trim()
    .toUpperCase();
  if (station === 'BAR') return 'bar';
  if (station === 'KITCHEN') return 'kitchen';
  if (BAR_KEYWORDS_RE.test(String(item?.name || ''))) return 'bar';
  return 'kitchen';
};
const inferProductionProfileFromItemAndProduct = (
  item: PrintItem,
  product?: any,
): 'bar' | 'kitchen' => {
  const station = String((item as any)?.station || '')
    .trim()
    .toUpperCase();
  if (station === 'BAR') return 'bar';
  if (station === 'KITCHEN') return 'kitchen';
  const category = String((product as any)?.category || '').trim().toLowerCase();
  if (DRINK_CATEGORY_RE.test(category)) return 'bar';
  if (FOOD_CATEGORY_RE.test(category)) return 'kitchen';
  return inferProductionProfile(item);
};

const escapePowerShellSingleQuoted = (value: string) =>
	String(value || '').replace(/'/g, "''");
const sanitizeFileName = (value: string, fallback = 'receipt') => {
	const safe = String(value || '')
		.trim()
		.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
		.replace(/\s+/g, '_')
		.replace(/-+/g, '-')
		.slice(0, 120)
		.replace(/^-+|-+$/g, '');
	return safe || fallback;
};
const resolveArchiveBaseDirectory = (settings: any) =>
  String(settings?.receiptPdfDirectory || '').trim() ||
  path.join(process.cwd(), 'tmp', 'pdf-archives');
const resolveExternalTemplatesDirectory = () =>
  process.platform === 'win32'
    ? 'C:\\ProgramData\\AxiaFlex\\templates'
    : '/var/lib/axiaflex/templates';
const resolveExternalClientTemplatePath = () =>
  path.join(resolveExternalTemplatesDirectory(), 'client-receipt-template.txt');
const resolveExternalBarTemplatePath = () =>
  path.join(resolveExternalTemplatesDirectory(), 'bar-ticket-template.txt');
const resolveExternalKitchenTemplatePath = () =>
  path.join(resolveExternalTemplatesDirectory(), 'kitchen-ticket-template.txt');
const resolveExternalTemplateCandidate = (basePathTxt: string) => {
  const baseNoExt = basePathTxt.replace(/\.txt$/i, '');
  const pdf = `${baseNoExt}.pdf`;
  const html = `${baseNoExt}.html`;
  const txt = `${baseNoExt}.txt`;
  if (existsSync(pdf)) return { path: pdf, kind: 'pdf' as const };
  if (existsSync(html)) return { path: html, kind: 'html' as const };
  if (existsSync(txt)) return { path: txt, kind: 'txt' as const };
  return null;
};
const ensureExternalTemplatesDirectory = async () => {
  try {
    await fs.mkdir(resolveExternalTemplatesDirectory(), { recursive: true });
  } catch {
    // ignore: fallback templates remain available
  }
};
const renderExternalClientTemplate = (
  templateText: string,
  data: Record<string, string>,
) => {
  let out = String(templateText || '');
  for (const [key, value] of Object.entries(data)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(value || ''));
  }
  return out;
};
const htmlToPlainText = (html: string) =>
  String(html || '')
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/style\s*>/gi, '')
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/script\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<\s*\/div\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// ─── ESC/POS thermal-printer formatting ──────────────────────────────────────
// Generates raw ESC/POS byte sequences: bold headers, centred lines,
// double-height totals and auto-cut — zero PDF-viewer dependency.
const EP = {
  INIT:     Buffer.from([0x1b, 0x40]),
  ALIGN_L:  Buffer.from([0x1b, 0x61, 0x00]),
  ALIGN_C:  Buffer.from([0x1b, 0x61, 0x01]),
  ALIGN_R:  Buffer.from([0x1b, 0x61, 0x02]),
  BOLD_ON:  Buffer.from([0x1b, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([0x1b, 0x45, 0x00]),
  DBL_H:    Buffer.from([0x1d, 0x21, 0x10]), // double height only
  NORMAL:   Buffer.from([0x1d, 0x21, 0x00]),
  CODEPAGE: Buffer.from([0x1b, 0x74, 0x10]), // WPC1252 — French chars
  FEED3:    Buffer.from([0x1b, 0x64, 0x03]),
  CUT:      Buffer.from([0x1d, 0x56, 0x42, 0x00]), // partial cut
};
const EP_W = THERMAL_LINE_WIDTH;
const epText = (s: string): Buffer => Buffer.from(s + '\n', 'latin1');
const epSep  = (ch = '-'): Buffer  => epText(ch.repeat(EP_W));
/** Left + right column in EP_W total characters */
const epCols = (left: string, right: string, width = EP_W): string => {
  const r = String(right || '').slice(0, width - 2);
  const l = clampText(String(left || ''), width - r.length - 1);
  return l + ' '.repeat(Math.max(1, width - l.length - r.length)) + r;
};

const buildClientReceiptEscPos = (
  settings: any,
  order: any,
  ticket: Ticket,
  items: TicketItem[],
  paymentMethod?: string,
  amount?: number,
): Buffer => {
  const bufs: Buffer[] = [];
  const push = (...b: Buffer[]) => bufs.push(...b);
  const txt  = (s: string) => push(epText(s));
  const layout   = (settings as any)?.clientTicketLayout || {};
  const show     = (key: string, def = true) =>
    layout?.[key] !== undefined ? Boolean(layout[key]) : def;
  const currency = String((settings as any)?.currency || 'DT');
  push(EP.INIT, EP.CODEPAGE);
  // Restaurant name — double-height bold centred
  push(EP.ALIGN_C, EP.DBL_H, EP.BOLD_ON);
  txt(clampText(String((settings as any)?.restaurantName || 'POS'), EP_W));
  push(EP.NORMAL, EP.BOLD_OFF);
  const headerText = String(layout?.headerText || '').trim();
  if (headerText) { push(EP.ALIGN_C); txt(headerText); }
  push(EP.ALIGN_L);
  push(epSep('='));
  if (show('showTicketNumber'))                             txt(`Ticket  : ${ticket.code}`);
  if ((order as any)?.ticketNumber)                        txt(`Commande: ${(order as any).ticketNumber}`);
  if (show('showDate'))                                    txt(`Date    : ${formatPrintableDate((ticket as any)?.createdAt)}`);
  if (show('showTable')  && (order as any)?.tableNumber)   txt(`Table   : ${(order as any).tableNumber}`);
  if (show('showServer') && (order as any)?.serverName)    txt(`Serveur : ${(order as any).serverName}`);
  if (show('showPaymentMethod') && paymentMethod)          txt(`Paiement: ${paymentMethod}`);
  if (show('showAddress') && (settings as any)?.address)   txt(clampText(String((settings as any).address), EP_W));
  if (show('showPhone') && (settings as any)?.phone)       txt(`Tel: ${(settings as any).phone}`);
  if (show('showTaxId') && (settings as any)?.taxId)       txt(`MF : ${(settings as any).taxId}`);
  push(epSep('-'));
  txt(epCols('Article', 'Montant'));
  push(epSep('-'));
  let subtotal = 0;
  for (const it of items) {
    const qty  = Number((it as any).quantity  || 0);
    const unit = Number((it as any).unitPrice || 0);
    const tot  = qty * unit;
    subtotal  += tot;
    push(EP.BOLD_ON);
    txt(epCols(`${qty}x ${clampText(String((it as any).name || 'Article'), EP_W - 12)}`, formatMoney3(tot)));
    push(EP.BOLD_OFF);
    if (show('showItemUnitPrice')) txt(`   PU ${formatMoney3(unit)} ${currency}`);
  }
  push(epSep('-'));
  const discount = Number((ticket as any)?.discount || 0);
  const timbre   = Number((ticket as any)?.timbre   || 0);
  const grandTot = Number((ticket as any)?.total    || subtotal);
  if (show('showPriceHt'))                           txt(epCols('Sous-total', `${subtotal.toFixed(3)} ${currency}`));
  if (show('showTicketDiscount') && discount > 0)   txt(epCols('Remise', `-${discount.toFixed(3)} ${currency}`));
  if (show('showTimbre')         && timbre > 0)     txt(epCols('Timbre',   `${timbre.toFixed(3)} ${currency}`));
  push(EP.ALIGN_R, EP.DBL_H, EP.BOLD_ON);
  txt(`TOTAL ${grandTot.toFixed(3)} ${currency}`);
  push(EP.NORMAL, EP.BOLD_OFF, EP.ALIGN_L);
  if (typeof amount === 'number')
    txt(epCols(`Regl.${paymentMethod ? ` (${paymentMethod})` : ''}`, `${amount.toFixed(3)} ${currency}`));
  const footerText = String(layout?.footerText || '').trim();
  if (footerText) { push(epSep('-'), EP.ALIGN_C); txt(footerText); push(EP.ALIGN_L); }
  push(EP.FEED3, EP.CUT);
  return Buffer.concat(bufs);
};

const buildProductionEscPos = (
  isBar: boolean,
  tpl: any,
  order: any,
  items: PrintItem[],
  titleOverride?: string,
): Buffer => {
  const bufs: Buffer[] = [];
  const push = (...b: Buffer[]) => bufs.push(...b);
  const txt  = (s: string) => push(epText(s));
  const title    = String(titleOverride || tpl?.title || (isBar ? 'BON BAR' : 'BON CUISINE'));
  const orderRef = resolveOrderReference(order);
  push(EP.INIT, EP.CODEPAGE);
  push(EP.ALIGN_C, EP.DBL_H, EP.BOLD_ON);
  txt(clampText(`*** ${title} ***`, EP_W));
  push(EP.NORMAL, EP.BOLD_OFF, EP.ALIGN_L);
  push(epSep('='));
  if (tpl?.showOrderRef !== false)                               txt(`Commande #${orderRef}`);
  if ((order as any)?.type)                                      txt(`Type    : ${(order as any).type}`);
  if (tpl?.showTable  !== false && (order as any)?.tableNumber)  txt(`Table   : ${(order as any).tableNumber}`);
  if (tpl?.showServer !== false && (order as any)?.serverName)   txt(`Serveur : ${(order as any).serverName}`);
  if (tpl?.showTime   !== false)  txt(`Heure   : ${formatPrintableDate((order as any)?.createdAt || Date.now())}`);
  push(epSep('='));
  for (const it of items) {
    const qty  = Number((it as any).quantity || 0);
    const name = clampText(String((it as any).name || 'Article'), EP_W - 6);
    push(EP.DBL_H, EP.BOLD_ON);
    txt(`${String(qty).padStart(2)}x  ${name}`);
    push(EP.NORMAL, EP.BOLD_OFF);
    if ((it as any).notes && tpl?.showItemNotes !== false)
      txt(`    > ${clampText(String((it as any).notes), EP_W - 6)}`);
  }
  push(epSep('='));
  const footer = String(tpl?.footerText || '').trim();
  if (footer) { push(EP.ALIGN_C); txt(footer); push(EP.ALIGN_L); }
  push(EP.FEED3, EP.CUT);
  return Buffer.concat(bufs);
};

const renderPlainTextPdfBuffer = async (plainText: string, template: any) => {
  const style = getPdfTemplateStyle(template);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const doc = new (PDFDocument as any)({ size: style.size, margin: style.margin });
    (doc as any).on('data', (chunk: Buffer) => chunks.push(chunk));
    (doc as any).on('end', () => resolve());
    (doc as any).on('error', reject);
    doc.font('Helvetica').fontSize(9).fillColor('#0F172A');
    doc.text(String(plainText || ''), {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'left',
    });
    (doc as any).end();
  });
  return Buffer.concat(chunks);
};
const renderHtmlPdfBuffer = async (html: string, template: any) =>
  renderPlainTextPdfBuffer(htmlToPlainText(String(html || '')), template);
const saveBufferToTempPdf = async (prefix: string, buffer: Buffer) => {
  const tmpDir = path.join(process.cwd(), 'tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const filePath = path.join(
    tmpDir,
    `${sanitizeFileName(prefix || 'ticket', 'ticket')}-${Date.now()}.pdf`,
  );
  await fs.writeFile(filePath, buffer);
  return filePath;
};
const buildClientTemplateData = (
  settings: any,
  order: any,
  ticket: Ticket,
  items: TicketItem[],
  paymentMethod?: string,
  amount?: number,
) => {
  const logoSrc = resolveLogoSource(settings);
  const nacefPayload = parseFiscalPayloadJson(ticket);
  const tx = nacefPayload?.transaction || {};
  const op = tx?.operation || {};
  const merchant = nacefPayload?.merchant_identity || {};
  const estab = merchant?.taxpayer_establishment || {};
  const saleDetails = Array.isArray(nacefPayload?.sale_details) ? nacefPayload.sale_details : [];
  const paymentRows = Array.isArray(nacefPayload?.payment_details?.collection_details)
    ? nacefPayload.payment_details.collection_details
    : [];
  return {
  restaurantName: String((settings as any)?.restaurantName || ''),
  headerText: String((settings as any)?.clientTicketLayout?.headerText || ''),
  footerText: String((settings as any)?.clientTicketLayout?.footerText || ''),
  ticketCode: String(ticket.code || ''),
  orderNumber: String(order?.ticketNumber || ''),
  tableNumber: String(order?.tableNumber || ''),
  serverName: String(order?.serverName || ''),
  createdAt: formatPrintableDate((ticket as any)?.createdAt),
  address: String((settings as any)?.address || ''),
  phone: String((settings as any)?.phone || ''),
  taxId: String((settings as any)?.taxId || ''),
  itemsLines: items
    .map((it) => `${(it as any).name} x${Number((it as any).quantity || 0)}`)
    .join('\n'),
  subtotal: Number(
    items.reduce(
      (acc, it: any) => acc + Number(it.quantity || 0) * Number(it.unitPrice || 0),
      0,
    ),
  ).toFixed(3),
  discount: Number((ticket as any)?.discount || 0).toFixed(3),
  timbre: Number((ticket as any)?.timbre ?? (order as any)?.timbre ?? 0).toFixed(3),
  total: Number((ticket as any)?.total || 0).toFixed(3),
  amount: typeof amount === 'number' ? amount.toFixed(3) : '',
  paymentMethod: String(
    paymentMethod || (ticket as any)?.paymentMethod || (order as any)?.paymentMethod || '',
  ),
  currency: String((settings as any)?.currency || 'DT'),
  logoSrc,
  logoUrl: logoSrc,
  fiscalStatus: String((ticket as any)?.fiscalStatus || 'PENDING'),
  fiscalMode: String((ticket as any)?.fiscalMode || ''),
  fiscalImdf: String((ticket as any)?.fiscalImdf || tx?.originator?.imdf || ''),
  fiscalErrorCode: String((ticket as any)?.fiscalErrorCode || ''),
  fiscalQrPayload: String((ticket as any)?.fiscalQrPayload || ''),
  nacefVersion: String(nacefPayload?.version || ''),
  nacefTransactionId: String(tx?.id || ''),
  nacefTimestamp: String(tx?.timestamp || ''),
  nacefOperationType: String(op?.op_type || ''),
  nacefOperationContext: String(op?.context || ''),
  nacefMf: String(merchant?.id || ''),
  nacefMerchantName: String(estab?.commercial_name || ''),
  nacefSaleDetails: saleDetails.map((row: any) => {
    const qty = Number(row?.quantity || 0);
    const name = String(row?.product?.name || 'Article');
    const unit = Number(row?.product?.price_pre_tax || 0) / 1000;
    const total = qty * unit;
    return {
      quantity: qty,
      name,
      unitPrice: unit.toFixed(3),
      total: total.toFixed(3),
    };
  }),
  nacefPaymentDetails: paymentRows.map((row: any) => ({
    method: String(row?.method || '-'),
    amount: (Number(row?.amount || 0) / 1000).toFixed(3),
  })),
  nacefTotalHt: Number(getPayloadHtTotal(nacefPayload || {})).toFixed(3),
  nacefTotalTva: Number(getPayloadTaxTotal(nacefPayload || {})).toFixed(3),
  nacefTotalTtc: Number(getPayloadSaleTotal(nacefPayload || {})).toFixed(3),
  nacefJson: (() => {
    try {
      return nacefPayload ? JSON.stringify(nacefPayload, null, 2) : '';
    } catch {
      return '';
    }
  })(),
  };
};
const formatPrintableDate = (raw: any) => {
  const n = Number(raw);
  let d: Date;
  if (Number.isFinite(n) && n > 0) {
    // Accept seconds or milliseconds epochs.
    d = n < 1e12 ? new Date(n * 1000) : new Date(n);
  } else {
    d = new Date(raw || Date.now());
  }
  if (Number.isNaN(d.getTime())) return new Date().toLocaleString();
  return d.toLocaleString();
};
const resolveOrderReference = (order: any) =>
  String(order?.ticketNumber || order?.orderNumber || order?.id || 'N/A');
const resolveLogoSource = (settings: any) => {
  const logoUrl = String((settings as any)?.logoUrl || '').trim();
  if (!logoUrl) return '';
  if (/^https?:\/\//i.test(logoUrl) || logoUrl.startsWith('data:')) return logoUrl;
  try {
    const logoAbs = path.join(
      process.cwd(),
      logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl,
    );
    const logoExt = (path.extname(logoAbs).slice(1).toLowerCase() || 'jpeg').replace(
      'jpg',
      'jpeg',
    );
    return `data:image/${logoExt};base64,${readFileSync(logoAbs).toString('base64')}`;
  } catch {
    // Keep URL path fallback (old behavior worked in browser mode).
    return logoUrl;
  }
};
const normalizeDesktopBridgeConfig = (settings: any) => {
  const cfg = (settings as any)?.desktopPrintBridge || {};
  return {
    enabled: Boolean(cfg?.enabled),
    url: String(cfg?.url || '').trim(),
    token: String(cfg?.token || '').trim(),
    timeoutMs: Math.max(500, Math.min(30000, Number(cfg?.timeoutMs || 4000))),
  };
};
const isDesktopBridgeMode = (settings: any) =>
  String((settings as any)?.printRoutingMode || 'LOCAL').toUpperCase() ===
    'DESKTOP_BRIDGE' && normalizeDesktopBridgeConfig(settings).enabled;
const isCloudRoutingMode = (settings: any) =>
  String((settings as any)?.printRoutingMode || 'LOCAL').toUpperCase() === 'CLOUD';
const shouldEnqueueTerminalJob = async (printerMeta?: {
  terminalNodeId?: string | null;
}) => {
  if (!printerMeta?.terminalNodeId) return false;
  try {
    const settings = await getSettings();
    return isCloudRoutingMode(settings);
  } catch {
    return false;
  }
};
const getDesignerTemplateHtml = (
  settings: any,
  kind: 'client' | 'kitchen' | 'bar',
) => {
  const d = (settings as any)?.designerPrintTemplates || {};
  if (kind === 'client') return String(d?.clientHtml || '').trim();
  if (kind === 'bar') return String(d?.barHtml || '').trim();
  return String(d?.kitchenHtml || '').trim();
};
/** Returns 'DESIGNER' if the user has toggled on the designer for this ticket kind, else 'BUILTIN'. */
const getPrintTemplateSource = (
  settings: any,
  kind: 'client' | 'kitchen' | 'bar',
): 'DESIGNER' | 'BUILTIN' => {
  const src = (settings as any)?.printTemplateSource || {};
  return String(src?.[kind] || '').toUpperCase() === 'DESIGNER' ? 'DESIGNER' : 'BUILTIN';
};
const postDesktopBridgeJob = async (settings: any, payload: any) => {
  const cfg = normalizeDesktopBridgeConfig(settings);
  if (!cfg.enabled || !cfg.url) throw new Error('Desktop Bridge non configuré');
  const base = cfg.url.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${base}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`Desktop Bridge ${res.status}: ${msg || 'print failed'}`);
    }
  } finally {
    clearTimeout(timer);
  }
};
export async function pingDesktopBridge(settings?: any) {
  const s = settings || (await getSettings());
  const cfg = normalizeDesktopBridgeConfig(s);
  if (!cfg.enabled || !cfg.url) {
    throw new Error('Desktop Bridge non activé/configuré');
  }
  const base = cfg.url.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const tryUrls = [`${base}/health`, `${base}/ping`, `${base}`];
    let lastCode = 0;
    for (const url of tryUrls) {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
        },
        signal: controller.signal,
      }).catch(() => null as any);
      if (res?.ok) return { ok: true, url };
      if (res) lastCode = Number(res.status || 0);
    }
    throw new Error(`Desktop Bridge inaccessible (${lastCode || 'offline'})`);
  } finally {
    clearTimeout(timer);
  }
}
const normalizeTicketTemplate = (value: any) => {
  const raw = String(value || 'CLASSIC').trim().toUpperCase();
  if (raw === 'COMPACT' || raw === 'MODERN' || raw === 'CLASSIC') return raw;
  return 'CLASSIC';
};
const isNacefPrintTemplateActive = (settings: any) =>
  Boolean((settings as any)?.nacefEnabled);
const assertNacefPrintReady = (settings: any) => {
  if (!isNacefPrintTemplateActive(settings)) return;
  const imdf = String((settings as any)?.nacefImdf || '').trim();
  if (!imdf) {
    throw new Error(
      "Impression ticket bloquee: NACEF est active mais l'IMDF est vide. Ouvrez Settings > NACEF, renseignez IMDF puis enregistrez.",
    );
  }
};
const parseFiscalPayloadJson = (ticket: any): any | null => {
  const raw = String((ticket as any)?.fiscalPayloadJson || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const getPayloadSaleTotal = (payload: any) =>
  Number(payload?.sale_summary?.total_incl_tax || 0) / 1000;
const getPayloadTaxTotal = (payload: any) =>
  Number(payload?.sale_summary?.total_tax || 0) / 1000;
const getPayloadHtTotal = (payload: any) =>
  Number(payload?.sale_summary?.total_excl_tax || 0) / 1000;
const getPayloadLines = (payload: any) =>
  Array.isArray(payload?.sale_details) ? payload.sale_details : [];
const getPayloadPaymentRows = (payload: any) =>
  Array.isArray(payload?.payment_details?.collection_details)
    ? payload.payment_details.collection_details
    : [];
const buildNacefStrictReceiptText = (payload: any, ticket: any, currency: string) => {
  const separator = makeSeparator('-');
  const strongSeparator = makeSeparator('=');
  const tx = payload?.transaction || {};
  const op = tx?.operation || {};
  const merchant = payload?.merchant_identity || {};
  const estab = merchant?.taxpayer_establishment || {};
  const lines = getPayloadLines(payload);
  const payments = getPayloadPaymentRows(payload);
  const out: string[] = [];
  out.push(strongSeparator);
  out.push(centerLine(String(estab?.commercial_name || 'TICKET FISCAL NACEF')));
  out.push('FORMAT: NACEF 1.1.4');
  out.push(separator);
  out.push(`Version: ${String(payload?.version || '-')}`);
  out.push(`Transaction: ${String(tx?.id || '-')}`);
  out.push(`Date: ${String(tx?.timestamp || '-')}`);
  out.push(`Operation: ${String(op?.op_type || '-')}`);
  out.push(`Contexte: ${String(op?.context || '-')}`);
  out.push(`IMDF: ${String(tx?.originator?.imdf || '-')}`);
  out.push(`MF: ${String(merchant?.id || '-')}`);
  out.push(separator);
  out.push(`${padRight('Qte/Article', 22)} ${padLeft('Montant', 8)}`);
  out.push(separator);
  for (const row of lines) {
    const qty = Number(row?.quantity || 0);
    const name = String(row?.product?.name || 'Article');
    const lineAmount = Number(row?.product?.price_pre_tax || 0) / 1000 * qty;
    out.push(`${padRight(clampText(`${qty}x ${name}`, 22), 22)} ${padLeft(formatMoney3(lineAmount), 8)}`);
  }
  out.push(separator);
  out.push(`Prix HT: ${formatMoney3(getPayloadHtTotal(payload))} ${currency}`);
  out.push(`TVA: ${formatMoney3(getPayloadTaxTotal(payload))} ${currency}`);
  out.push(`Prix TTC: ${formatMoney3(getPayloadSaleTotal(payload))} ${currency}`);
  if (payments.length > 0) {
    out.push(separator);
    for (const p of payments) {
      out.push(`Paiement ${String(p?.method || '-')}: ${formatMoney3(Number(p?.amount || 0) / 1000)} ${currency}`);
    }
  }
  out.push(separator);
  out.push(`NACEF: ${String((ticket as any)?.fiscalStatus || payload?.transaction?.status || 'PENDING').toUpperCase()}`);
  if (tx?.originator?.fiscalization_mode || (ticket as any)?.fiscalMode) {
    out.push(`Mode: ${String(tx?.originator?.fiscalization_mode || (ticket as any)?.fiscalMode).toUpperCase()}`);
  }
  if ((ticket as any)?.fiscalErrorCode) out.push(`Erreur: ${String((ticket as any)?.fiscalErrorCode)}`);
  out.push(`${strongSeparator}\n`);
  return out.join('\n');
};
const buildNacefStrictReceiptHtml = (
  printerName: string,
  payload: any,
  ticket: any,
  currency: string,
) => {
  const safe = String(printerName || 'Imprimante').replace(/[<>"'&]/g, ' ');
  const tx = payload?.transaction || {};
  const op = tx?.operation || {};
  const merchant = payload?.merchant_identity || {};
  const estab = merchant?.taxpayer_establishment || {};
  const lines = getPayloadLines(payload);
  const payments = getPayloadPaymentRows(payload);
  const itemsHtml = lines
    .map((row: any) => {
      const qty = Number(row?.quantity || 0);
      const name = String(row?.product?.name || 'Article');
      const unit = Number(row?.product?.price_pre_tax || 0) / 1000;
      const total = unit * qty;
      return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;font-weight:700;color:#374151;margin-bottom:2px">
<span>${qty}x ${name} <span style="font-weight:400;color:#94a3b8">(${unit.toFixed(3)} ${currency})</span></span>
<span style="white-space:nowrap">${total.toFixed(3)} ${currency}</span></div>`;
    })
    .join('');
  const paymentsHtml = payments
    .map((row: any) => `<div style="display:flex;justify-content:space-between;font-size:9px;color:#64748b"><span>${String(row?.method || '-')}</span><span>${(Number(row?.amount || 0) / 1000).toFixed(3)} ${currency}</span></div>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:80mm auto;margin:0}
html,body{height:fit-content;min-height:0;overflow:visible;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;padding:3mm}
.notice{background:#1e3a8a;color:#fff;font-size:13px;text-align:center;padding:8px 12px;margin-bottom:8px;border-radius:5px}
@media print{.notice{display:none}}
.card{background:#fff;border-radius:10px;padding:12px;border:2px solid #0f172a}
.sep{border:none;border-top:1px dashed #cbd5e1;margin:6px 0}
</style></head><body>
<div class="notice">&#x1F5A8; S&eacute;lectionnez&nbsp;: <strong>${safe}</strong> &mdash; puis cliquez <strong>Imprimer</strong></div>
<div class="card">
<div style="text-align:center;font-size:16px;font-weight:900;color:#1e293b">${String(estab?.commercial_name || 'TICKET FISCAL NACEF')}</div>
<div style="text-align:center;font-size:9px;color:#64748b;margin-top:2px">FORMAT NACEF 1.1.4</div>
<hr class="sep">
<div style="font-size:9px;color:#64748b;line-height:1.5">
<div>Version: ${String(payload?.version || '-')}</div>
<div>Transaction: ${String(tx?.id || '-')}</div>
<div>Date: ${String(tx?.timestamp || '-')}</div>
<div>Opération: ${String(op?.op_type || '-')} / ${String(op?.context || '-')}</div>
<div>IMDF: ${String(tx?.originator?.imdf || '-')}</div>
<div>MF: ${String(merchant?.id || '-')}</div>
</div>
<hr class="sep">
${itemsHtml}
<hr class="sep">
<div style="font-size:10px;font-weight:700;color:#1e293b;line-height:1.9">
<div style="display:flex;justify-content:space-between"><span>Prix HT</span><span>${getPayloadHtTotal(payload).toFixed(3)} ${currency}</span></div>
<div style="display:flex;justify-content:space-between"><span>TVA</span><span>${getPayloadTaxTotal(payload).toFixed(3)} ${currency}</span></div>
<div style="display:flex;justify-content:space-between;color:#4338ca;font-size:14px;font-weight:900"><span>Prix TTC</span><span>${getPayloadSaleTotal(payload).toFixed(3)} ${currency}</span></div>
</div>
${paymentsHtml ? `<hr class="sep"><div style="font-size:9px;color:#64748b">${paymentsHtml}</div>` : ''}
<hr class="sep">
<div style="font-size:10px;color:#0f172a;line-height:1.5">
  <div style="font-weight:900">BLOC FISCAL NACEF</div>
  <div>Statut: ${String((ticket as any)?.fiscalStatus || 'PENDING').toUpperCase()}</div>
  ${String((ticket as any)?.fiscalMode || '').trim() ? `<div>Mode: ${String((ticket as any).fiscalMode).toUpperCase()}</div>` : ''}
  ${String((ticket as any)?.fiscalErrorCode || '').trim() ? `<div>Code erreur: ${String((ticket as any).fiscalErrorCode)}</div>` : ''}
</div>
${String((ticket as any)?.fiscalQrPayload || '').trim() ? `<div style="text-align:center;margin-top:8px"><img src="https://quickchart.io/qr?text=${encodeURIComponent(String((ticket as any).fiscalQrPayload))}&size=180&ecLevel=H&margin=2" style="width:180px;height:180px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;padding:6px" /><div style="font-size:9px;color:#64748b;margin-top:4px">QR fiscal NACEF</div></div>` : ''}
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350);};window.onafterprint=function(){setTimeout(function(){try{window.close();}catch(e){}},1000);};</script>
</body></html>`;
};
const getPdfTemplateStyle = (template: any) => {
  const t = normalizeTicketTemplate(template);
  if (t === 'COMPACT') {
    return {
      size: 'A5' as const,
      margin: 18,
      font: 'Courier',
      fontSize: 8,
      lineGap: 0.5,
      width: 380,
    };
  }
  if (t === 'MODERN') {
    return {
      size: 'A4' as const,
      margin: 30,
      font: 'Helvetica',
      fontSize: 10,
      lineGap: 1.5,
      width: 520,
    };
  }
  return {
    size: 'A4' as const,
    margin: 28,
    font: 'Courier',
    fontSize: 10,
    lineGap: 1,
    width: 540,
  };
};

const resolveWindowsPrinterName = async (requestedName: string) => {
	const requested = String(requestedName || '').trim();
	if (!requested) return '';
	const escapedRequested = escapePowerShellSingleQuoted(requested);
	try {
		const { stdout } = await execFileAsync('powershell', [
			'-NoProfile',
			'-ExecutionPolicy',
			'Bypass',
			'-Command',
			`$target='${escapedRequested}'; $p = Get-Printer -Name $target -ErrorAction SilentlyContinue; if ($p) { $p.Name } else { $d = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1; if ($d) { $d.Name } }`,
		]);
		return String(stdout || '').trim();
	} catch {
		return '';
	}
};

const saveTextAsPdf = async (
	prefix: string,
	text: string,
	options?: { directory?: string; fixedFileName?: string; ticketTemplate?: string },
) => {
	const rawDir = String(options?.directory || '').trim();
	const dir = rawDir || path.join(process.cwd(), 'tmp');
	await fs.mkdir(dir, { recursive: true });
	const safePrefix = sanitizeFileName(
		String(prefix || 'print')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, ''),
		'print',
	);
	const fixedName = String(options?.fixedFileName || '').trim();
	const fileName = fixedName
		? `${sanitizeFileName(fixedName, safePrefix)}.pdf`
		: `${safePrefix}-${Date.now()}.pdf`;
	const filePath = path.join(dir, fileName);
  const style = getPdfTemplateStyle(options?.ticketTemplate);
	await new Promise<void>((resolve, reject) => {
		const doc = new (PDFDocument as any)({ size: style.size, margin: style.margin });
		const stream = createWriteStream(filePath);
		stream.on('finish', () => resolve());
		stream.on('error', reject);
		(doc as any).on('error', reject);
		(doc as any).pipe(stream);
		(doc as any).font(style.font).fontSize(style.fontSize).text(String(text || ''), {
			width: style.width,
			align: 'left',
      lineGap: style.lineGap,
		});
		(doc as any).end();
	});
	return filePath;
};

export async function saveCategorizedPdf(opts: {
	categoryPath: string[];
	prefix: string;
	text: string;
	fixedFileName?: string;
  ticketTemplate?: string;
}) {
	const settings = await getSettings();
	const baseDir = resolveArchiveBaseDirectory(settings);
	const safePath = Array.isArray(opts.categoryPath) ? opts.categoryPath : [];
	const directory = safePath.reduce(
		(acc, seg) => path.join(acc, sanitizeFileName(seg, 'misc')),
		baseDir,
	);
	const filePath = await saveTextAsPdf(opts.prefix, opts.text, {
		directory,
		fixedFileName: opts.fixedFileName,
    ticketTemplate: opts.ticketTemplate,
	});
  const rel = path.relative(baseDir, filePath);
  await savePdfArchiveFromFile({
    category: sanitizeFileName(safePath[0] || 'misc', 'misc'),
    relativePath: rel,
    absolutePath: filePath,
  }).catch(() => undefined);
  return filePath;
}

const printText = async (
	printerName: string,
	text: string,
	printerMeta?: { terminalNodeId?: string | null; terminalPrinterLocalId?: string | null },
) => {
	if (await shouldEnqueueTerminalJob(printerMeta)) {
		await enqueuePrintJob({
			terminalNodeId: String(printerMeta!.terminalNodeId),
			printerLocalId: printerMeta!.terminalPrinterLocalId || null,
			printerName: printerName || null,
			payload: {
				type: 'RAW_TEXT_PRINT',
				text,
				printerName,
			},
			maxRetries: 5,
		});
		return;
	}
	const dir = path.join(process.cwd(), 'tmp');
	await fs.mkdir(dir, { recursive: true });
	const filePath = path.join(dir, `print-${Date.now()}.txt`);
	await fs.writeFile(filePath, text, 'utf8');
	try {
		const targetPrinter =
			process.platform === 'win32'
				? await resolveWindowsPrinterName(printerName)
				: String(printerName || '').trim();
		if (!targetPrinter) {
			throw new Error(`Imprimante introuvable: ${printerName}`);
		}
		const escapedPath = escapePowerShellSingleQuoted(filePath);
		const escapedPrinter = escapePowerShellSingleQuoted(targetPrinter);
		await execFileAsync('powershell', [
			'-NoProfile',
			'-ExecutionPolicy',
			'Bypass',
			'-Command',
			`$path='${escapedPath}'; $printer='${escapedPrinter}'; Get-Content -LiteralPath $path | Out-Printer -Name $printer`,
		]);
	} catch (err) {
		const savedPdf = await saveTextAsPdf(printerName || 'print-fallback', text);
		console.warn(
			`[print] Impression indisponible (${printerName}). PDF sauvegardé: ${savedPdf}`,
		);
	} finally {
		await fs.unlink(filePath).catch(() => undefined);
	}
};

// ─── In-memory HTTP print store ───────────────────────────────────────────────
// The backend serves print pages via its own HTTP server at:
//   http://localhost:<PORT>/print/preview/<token>
// No temp files, no file:// protocol, no ERR_FILE_NOT_FOUND.
// The page auto-prints (window.print()) and the token expires after 90 s.

const _printStore = new Map<string, { html: string; expiresAt: number }>();

/** Register one print page; returns its serve token. */
export function registerPrintPage(html: string): string {
  // Simple crypto-random token without importing crypto module
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  _printStore.set(token, { html, expiresAt: Date.now() + 90_000 });
  // Lazy GC: purge expired entries whenever we register
  for (const [k, v] of _printStore) {
    if (v.expiresAt < Date.now()) _printStore.delete(k);
  }
  return token;
}

/** Called by app.ts to serve a registered print page. Returns null if not found. */
export function servePrintPage(token: string): string | null {
  const entry = _printStore.get(String(token || ''));
  if (!entry || entry.expiresAt < Date.now()) {
    _printStore.delete(String(token || ''));
    return null;
  }
  return entry.html;
}

const BACKEND_PORT = Number(process.env.PORT || 3001);
const BROWSER_CANDIDATES_WIN = [
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

/** Wraps any HTML body with a print-ready envelope: 80mm page, auto-print, auto-close */
const wrapHtmlForPrint = (printerName: string, bodyHtml: string): string => {
  const safe = String(printerName || 'Imprimante').replace(/[<>"'&]/g, ' ');
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:80mm auto;margin:3mm 4mm}
html,body{height:fit-content;min-height:0;overflow:visible}
body{font-family:'Courier New',Courier,monospace;font-size:12px;color:#000;background:#fff;width:72mm}
.c{text-align:center}.r{text-align:right}.b{font-weight:bold}
.xl{font-size:17px;font-weight:bold}.xxl{font-size:22px;font-weight:bold}
.dash{border-bottom:1px dashed #000;margin:4px 0}
.solid{border-bottom:2px solid #000;margin:4px 0}
.row{display:flex;justify-content:space-between;align-items:baseline}
.notice{background:#1e3a8a;color:#fff;font-family:sans-serif;font-size:13px;text-align:center;padding:8px 12px;margin-bottom:10px;border-radius:5px}
@media print{.notice{display:none}}
</style></head><body>
<div class="notice">&#x1F5A8; S&eacute;lectionnez : <strong>${safe}</strong> &mdash; puis cliquez <strong>Imprimer</strong></div>
${bodyHtml}
<script>
window.onload=function(){setTimeout(function(){window.print();},600);};
window.onafterprint=function(){setTimeout(function(){try{window.close();}catch(e){}},1000);};
</script></body></html>`;
};

/** Open a URL in the system browser without waiting for it to close. */
const openUrlInBrowser = async (url: string): Promise<void> => {
  if (process.platform !== 'win32') {
    const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  let browserPath = '';
  for (const c of BROWSER_CANDIDATES_WIN) {
    try { await fs.access(c); browserPath = c; break; } catch { /* try next */ }
  }
  if (browserPath) {
    const child = spawn(
      browserPath,
      ['--new-window', '--no-first-run', '--disable-extensions', '--disable-default-apps', url],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();
  } else {
    // Fallback: PowerShell Start-Process opens default browser
    const esc = escapePowerShellSingleQuoted(url);
    await execFileAsync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-Command', `Start-Process '${esc}'`,
    ]);
  }
};

/**
 * PRIMARY print function for LOCAL mode.
 * Registers HTML in the in-memory store, opens http://localhost:PORT/print/preview/<token>.
 * For CLOUD mode, enqueue the same HTML so layout stays identical across modes.
 */
const printViaLocalBrowser = async (
  printerName: string,
  htmlContent: string,
  tag = 'print',
  printerMeta?: { terminalNodeId?: string | null; terminalPrinterLocalId?: string | null },
  cloudTemplate?: { kind?: string; data?: Record<string, unknown> },
): Promise<void> => {
  if (await shouldEnqueueTerminalJob(printerMeta)) {
    await enqueuePrintJob({
      terminalNodeId: String(printerMeta!.terminalNodeId),
      printerLocalId: printerMeta!.terminalPrinterLocalId || null,
      printerName: printerName || null,
      payload: {
        type: 'HTML_PRINT',
        printerName,
        fileName: `${sanitizeFileName(String(tag || 'print'), 'print')}.html`,
        htmlBase64: Buffer.from(String(htmlContent || ''), 'utf8').toString('base64'),
        templateKind: String(cloudTemplate?.kind || '').trim() || undefined,
        templateData: cloudTemplate?.data || undefined,
      },
      maxRetries: 3,
    });
    return;
  }
  const token = registerPrintPage(htmlContent);
  const url = `http://localhost:${BACKEND_PORT}/print/preview/${token}`;
  console.info(`[print] popup → ${url}`);
  await openUrlInBrowser(url);
};


/** Complete standalone card-style receipt HTML matching the settings live preview */
const buildModelReceiptHtml = (
  printerName: string,
  settings: any,
  order: any,
  ticket: Ticket,
  items: TicketItem[],
  paymentMethod?: string,
  amount?: number,
): string => {
  const nacefTemplateActive = isNacefPrintTemplateActive(settings);
  const nacefPayload = parseFiscalPayloadJson(ticket);
  if (nacefTemplateActive) {
    const currency = String((settings as any)?.currency || 'DT').trim();
    return buildNacefStrictReceiptHtml(printerName, nacefPayload || {}, ticket, currency);
  }
  const layout   = (settings as any)?.clientTicketLayout || {};
  const show     = (key: string, def = true) =>
    nacefTemplateActive
      ? true
      : layout?.[key] !== undefined
        ? Boolean(layout[key])
        : def;
  const currency  = String((settings as any)?.currency || 'DT');
  const rName     = String((settings as any)?.restaurantName || 'POS');
  const headerTxt = String(layout?.headerText || '').trim();
  const footerTxt = String(layout?.footerText || '').trim();
  const logoUrl   = String((settings as any)?.logoUrl || '').trim();
  const showLogo  = show('showLogo', true) && !!logoUrl;
  const logoSrc = showLogo ? resolveLogoSource(settings) : '';

  // Compute amounts
  let subtotal = 0;
  let itemsHtml = '';
  for (const it of items) {
    const qty  = Number((it as any).quantity  || 0);
    const unit = Number((it as any).unitPrice || 0);
    const tot  = qty * unit;
    subtotal  += tot;
    itemsHtml += `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;font-weight:700;color:#374151;margin-bottom:2px">
<span>${qty}x ${String((it as any).name || 'Article')}${show('showItemUnitPrice') ? ` <span style="font-weight:400;color:#94a3b8">(${unit.toFixed(3)} ${currency})</span>` : ''}</span>
<span style="white-space:nowrap">${tot.toFixed(3)} ${currency}</span></div>`;
  }

  const discount = Math.round(parseFloat(String((ticket as any)?.discount ?? 0)) * 1000) / 1000;
  const timbre   = Math.round(parseFloat(String((ticket as any)?.timbre ?? (order as any)?.timbre ?? 0)) * 1000) / 1000;
  const grandTot = Math.round(parseFloat(String((ticket as any)?.total    || subtotal)) * 1000) / 1000;
  const applyTva = Boolean((settings as any)?.applyTvaToTicket);
  const tvaRate  = Number((settings as any)?.tvaRate || 0);
  const ht       = Math.max(0, subtotal - discount);
  const tvaAmt   = (show('showTva') && applyTva && tvaRate > 0) ? ht * (tvaRate / 100) : 0;

  // Meta rows (centered, small gray)
  const metaHtml = [
    show('showDate')         ? `<div>${formatPrintableDate((ticket as any)?.createdAt)}</div>` : '',
    show('showTicketNumber') ? `<div>Ticket: ${ticket.code}</div>` : '',
    (order as any)?.ticketNumber ? `<div>Commande: ${(order as any).ticketNumber}</div>` : '',
    show('showAddress') && (settings as any)?.address ?  `<div>${(settings as any).address}</div>` : '',
    show('showPhone')   && (settings as any)?.phone   ? `<div>Tel: ${(settings as any).phone}</div>` : '',
    show('showTaxId')   && (settings as any)?.taxId   ? `<div>MF: ${(settings as any).taxId}</div>` : '',
    show('showServer')  && (order as any)?.serverName ? `<div>Serveur: ${(order as any).serverName}</div>` : '',
    show('showTable')   && (order as any)?.tableNumber ? `<div>Table: <strong>${(order as any).tableNumber}</strong></div>` : '',
    show('showClientName') && (order as any)?.clientName ? `<div>Client: ${(order as any).clientName}</div>` : '',
    show('showPaymentMethod') && paymentMethod ? `<div>Paiement: ${paymentMethod}</div>` : '',
    show('showTerminal') && (settings as any)?.terminalId ? `<div>Terminal: ${(settings as any).terminalId}</div>` : '',
  ].filter(Boolean).join('');

  // Totals rows
  const totalsHtml = [
    show('showPriceHt') ?
      `<div style="display:flex;justify-content:space-between"><span>Prix HT</span><span>${ht.toFixed(3)} ${currency}</span></div>` : '',
    show('showTicketDiscount') && discount > 0 ?
      `<div style="display:flex;justify-content:space-between;color:#f97316"><span>Remise ticket</span><span>-${discount.toFixed(3)} ${currency}</span></div>` : '',
    show('showTva') && tvaAmt > 0 ?
      `<div style="display:flex;justify-content:space-between;color:#3b82f6"><span>TVA (${tvaRate}%)</span><span>${tvaAmt.toFixed(3)} ${currency}</span></div>` : '',
    show('showTimbre') && timbre > 0 ?
      `<div style="display:flex;justify-content:space-between;color:#3b82f6"><span>Timbre</span><span>${timbre.toFixed(3)} ${currency}</span></div>` : '',
    show('showPriceTtc') ?
      `<div style="display:flex;justify-content:space-between;color:#4338ca;font-size:14px;font-weight:900"><span>Prix TTC</span><span>${grandTot.toFixed(3)} ${currency}</span></div>` : '',
    typeof amount === 'number' ?
      `<div style="display:flex;justify-content:space-between;font-size:9px;color:#64748b"><span>R&#232;glement${paymentMethod ? ` (${paymentMethod})` : ''}</span><span>${amount.toFixed(3)} ${currency}</span></div>` : '',
  ].filter(Boolean).join('');
  const nacefBlockHtml = nacefTemplateActive
    ? `<hr class="sep">
<div style="font-size:10px;color:#0f172a;line-height:1.5">
  <div style="font-weight:900">BLOC FISCAL NACEF</div>
  ${nacefPayload?.version ? `<div>Version: ${String(nacefPayload.version)}</div>` : ''}
  ${nacefPayload?.transaction?.id ? `<div>Transaction: ${String(nacefPayload.transaction.id)}</div>` : ''}
  ${nacefPayload?.transaction?.timestamp ? `<div>Date fiscale: ${String(nacefPayload.transaction.timestamp)}</div>` : ''}
  ${nacefPayload?.transaction?.operation?.op_type ? `<div>Operation: ${String(nacefPayload.transaction.operation.op_type)}</div>` : ''}
  ${nacefPayload?.merchant_identity?.id ? `<div>MF: ${String(nacefPayload.merchant_identity.id)}</div>` : ''}
  <div>Statut: ${String((ticket as any)?.fiscalStatus || 'PENDING').toUpperCase()}</div>
  ${String((ticket as any)?.fiscalMode || '').trim() ? `<div>Mode: ${String((ticket as any).fiscalMode).toUpperCase()}</div>` : ''}
  ${String((ticket as any)?.fiscalImdf || '').trim() ? `<div>IMDF: ${String((ticket as any).fiscalImdf)}</div>` : ''}
  ${String((ticket as any)?.fiscalErrorCode || '').trim() ? `<div>Code erreur: ${String((ticket as any).fiscalErrorCode)}</div>` : ''}
</div>
${String((ticket as any)?.fiscalQrPayload || '').trim() ? `<div style="text-align:center;margin-top:8px"><img src="https://quickchart.io/qr?text=${encodeURIComponent(String((ticket as any).fiscalQrPayload))}&size=180&ecLevel=H&margin=2" style="width:180px;height:180px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;padding:6px" /><div style="font-size:9px;color:#64748b;margin-top:4px">QR fiscal NACEF</div></div>` : ''}`
    : '';

  const safe = String(printerName || 'Imprimante').replace(/[<>"'&]/g, ' ');
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:80mm auto;margin:0}
html,body{height:fit-content;min-height:0;overflow:visible;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;padding:3mm}
.notice{background:#1e3a8a;color:#fff;font-size:13px;text-align:center;padding:8px 12px;margin-bottom:8px;border-radius:5px}
@media print{.notice{display:none}}
.card{background:#fff;border-radius:10px;padding:12px;border:1px solid #e2e8f0}
.sep{border:none;border-top:1px dashed #cbd5e1;margin:6px 0}
</style></head><body>
<div class="notice">&#x1F5A8; S&eacute;lectionnez&nbsp;: <strong>${safe}</strong> &mdash; puis cliquez <strong>Imprimer</strong></div>
<div class="card">
${showLogo ? `<div style="text-align:center;margin-bottom:8px"><img src="${logoSrc}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0" onerror="this.style.display='none'"></div>` : ''}
<div style="text-align:center;font-size:16px;font-weight:900;color:#1e293b">${rName}</div>
${headerTxt ? `<div style="text-align:center;font-size:9px;color:#64748b;margin-top:2px">${headerTxt}</div>` : ''}
<hr class="sep">
<div style="font-size:9px;color:#64748b;text-align:center;line-height:1.5">${metaHtml}</div>
<hr class="sep">
<div>${itemsHtml}</div>
<hr class="sep">
<div style="font-size:10px;font-weight:700;color:#1e293b;line-height:1.9">${totalsHtml}</div>
${nacefBlockHtml}
${footerTxt ? `<hr class="sep"><div style="text-align:center;font-size:9px;color:#64748b">${footerTxt}</div>` : ''}
</div>
<script>
window.onload=function(){
  var imgs=[].slice.call(document.querySelectorAll('img'));
  if(!imgs.length){setTimeout(function(){window.print();},400);return;}
  var n=imgs.length,done=0;
  function tryPrint(){done++;if(done>=n)setTimeout(function(){window.print();},200);}
  imgs.forEach(function(img){if(img.complete&&img.naturalWidth>0){tryPrint();}else{img.onload=tryPrint;img.onerror=tryPrint;}});
  setTimeout(function(){if(!window._printed){window.print();}},3000);
};
window.onafterprint=function(){window._printed=true;setTimeout(function(){try{window.close();}catch(e){}},1000);};
</script></body></html>`;
};

/** Styled 80mm HTML body for a kitchen or bar production ticket */
const buildProductionHtmlBody = (
  isBar: boolean,
  tpl: any,
  order: any,
  items: PrintItem[],
  titleOverride?: string,
): string => {
  const title    = String(titleOverride || tpl?.title || (isBar ? 'BON BAR' : 'BON CUISINE'));
  const orderRef = resolveOrderReference(order);
  let itemsHtml  = '';
  for (const it of items) {
    const qty  = Number((it as any).quantity || 0);
    const name = String((it as any).name || 'Article');
    const line = `- ${name}${tpl?.showItemQty !== false ? ` x${qty}` : ''}${
      (it as any).notes && tpl?.showItemNotes !== false ? ` (${String((it as any).notes)})` : ''
    }`;
    itemsHtml += `<p style="margin:0;line-height:1.35">${line}</p>`;
  }
  const metaRows = [
    tpl?.showOrderRef !== false ? `<div><span style="color:#555">Commande:</span> <strong>${orderRef}</strong></div>` : '',
    (order as any)?.type ? `<div><span style="color:#555">Type:</span> ${(order as any).type}</div>` : '',
    tpl?.showTable  !== false && (order as any)?.tableNumber ? `<div style="font-size:15px"><span style="color:#555">Table:</span> <strong>${(order as any).tableNumber}</strong></div>` : '',
    tpl?.showServer !== false && (order as any)?.serverName  ? `<div><span style="color:#555">Serveur:</span> ${(order as any).serverName}</div>` : '',
    tpl?.showTime   !== false ? `<div><span style="color:#555">Heure:</span> ${formatPrintableDate((order as any)?.createdAt || Date.now())}</div>` : '',
  ].filter(Boolean).join('');
  const footerTxt = String(tpl?.footerText || '').trim();
  return `<div style="font-size:11px;font-weight:700;color:#334155">
<p class="c" style="font-size:20px;font-weight:900;padding:4px 0 2px;margin:0;color:#0f172a">${title}</p>
<div style="margin-top:4px;font-size:10px;color:#64748b;line-height:1.35">${metaRows}</div>
<div class="dash"></div>
<div style="font-size:14px;font-weight:800;color:#111827;line-height:1.45">${itemsHtml}</div>
${footerTxt ? `<div class="dash"></div><p class="c" style="color:#64748b;margin-top:4px">${footerTxt}</p>` : ''}
</div>`;
};

const printPdf = async (
  printerName: string,
  pdfPath: string,
  printerMeta?: { terminalNodeId?: string | null; terminalPrinterLocalId?: string | null },
) => {
  const fullPath = String(pdfPath || '').trim();
  if (!fullPath) throw new Error('Missing PDF path');
  if (await shouldEnqueueTerminalJob(printerMeta)) {
    const raw = await fs.readFile(fullPath);
    await enqueuePrintJob({
      terminalNodeId: String(printerMeta!.terminalNodeId),
      printerLocalId: printerMeta!.terminalPrinterLocalId || null,
      printerName: printerName || null,
      payload: {
        type: 'PDF_PRINT',
        printerName,
        fileName: path.basename(fullPath),
        pdfBase64: raw.toString('base64'),
      },
      maxRetries: 3,
    });
    return;
  }
  // PDF: convert to HTML and open via browser popup (no PDF viewer needed)
  const text = await fs.readFile(fullPath).then(() => '').catch(() => '');
  console.warn(`[print] PDF popup not yet supported, skipping: ${fullPath}`);
};

/**
 * printHtml – LOCAL mode: injects auto-print into the HTML and opens it in the browser.
 * CLOUD mode: enqueues as HTML_PRINT job.
 */
const printHtml = async (
  printerName: string,
  htmlPath: string,
  printerMeta?: { terminalNodeId?: string | null; terminalPrinterLocalId?: string | null },
) => {
  const fullPath = String(htmlPath || '').trim();
  if (!fullPath) throw new Error('Missing HTML path');
  if (await shouldEnqueueTerminalJob(printerMeta)) {
    const raw = await fs.readFile(fullPath);
    await enqueuePrintJob({
      terminalNodeId: String(printerMeta!.terminalNodeId),
      printerLocalId: printerMeta!.terminalPrinterLocalId || null,
      printerName: printerName || null,
      payload: {
        type: 'HTML_PRINT',
        printerName,
        fileName: path.basename(fullPath),
        htmlBase64: raw.toString('base64'),
      },
      maxRetries: 3,
    });
    return;
  }
  // LOCAL: read the HTML, add auto-print wrapper, serve via in-memory HTTP store
  let html = await fs.readFile(fullPath, 'utf8').catch(() => '');
  if (!html) {
    console.warn(`[print] printHtml: fichier introuvable ${fullPath}`);
    return;
  }
  // Inject @page CSS + auto-print script + printer selection notice if not already present
  if (!html.includes('window.print()')) {
    const autoScript = `<script>window.onload=function(){setTimeout(function(){window.print();},600);};window.onafterprint=function(){setTimeout(function(){try{window.close();}catch(e){}},1000);};</script>`;
    const noticeSafe = String(printerName || '').replace(/[<>"'&]/g, ' ');
    const noticeHtml = `<div style="background:#1e3a8a;color:#fff;font-family:sans-serif;font-size:13px;text-align:center;padding:8px 12px;margin-bottom:10px;border-radius:5px" class="no-print">&#x1F5A8; S&eacute;lectionnez : <strong>${noticeSafe}</strong></div>`;
    const pageStyle = !html.includes('@page') ? `<style>@page{size:80mm auto;margin:3mm 4mm}html,body{height:fit-content;min-height:0;overflow:visible}@media print{.no-print{display:none}}</style>` : '';
    html = html.includes('</body>')
      ? html.replace('</body>', `${noticeHtml}${autoScript}</body>`).replace('</head>', `${pageStyle}</head>`)
      : pageStyle + html + noticeHtml + autoScript;
  }
  const token = registerPrintPage(html);
  const url = `http://localhost:${BACKEND_PORT}/print/preview/${token}`;
  console.info(`[print] printHtml popup → ${url}`);
  await openUrlInBrowser(url);
};

const buildReceiptText = (
  settings: any,
  order: any,
  ticket: Ticket,
  items: TicketItem[],
  paymentMethod?: string,
  amount?: number,
) => {
  const nacefTemplateActive = isNacefPrintTemplateActive(settings);
  const nacefPayload = parseFiscalPayloadJson(ticket);
  if (nacefTemplateActive) {
    const currency = String((settings as any)?.currency || 'DT').trim();
    return buildNacefStrictReceiptText(nacefPayload || {}, ticket, currency);
  }
  const layout = (settings as any)?.clientTicketLayout || {};
  const show = (key: string, defaultValue = true) =>
    nacefTemplateActive
      ? true
      : layout?.[key] !== undefined
        ? Boolean(layout[key])
        : defaultValue;
  const headerText = String(layout?.headerText || '').trim();
  const footerText = String(layout?.footerText || '').trim();
  const currency = String((settings as any)?.currency || 'DT').trim();
  const createdAt = formatPrintableDate((ticket as any)?.createdAt);
  const externalPath = resolveExternalClientTemplatePath();
  let sum = 0;
  const itemRows: string[] = [];
  for (const it of items) {
    const qty = Number((it as any).quantity || 0);
    const price = Number((it as any).unitPrice || 0);
    const total = qty * price;
    sum += total;
    const leftColWidth = show('showItemUnitPrice', true) ? 22 : 24;
    const amountText = formatMoney3(total);
    const label = clampText(`${qty}x ${(it as any).name || 'Article'}`, leftColWidth);
    itemRows.push(`${padRight(label, leftColWidth)} ${padLeft(amountText, 8)}`);
    if (show('showItemUnitPrice', true)) {
      itemRows.push(`   PU ${formatMoney3(price)}`);
    }
  }
  // Legacy external TXT templates are intentionally ignored here so in-app
  // ticket configuration (CLASSIC/COMPACT/MODERN + layout toggles) stays authoritative.
  const tpl = nacefTemplateActive
    ? 'CLASSIC'
    : normalizeTicketTemplate((settings as any)?.clientTicketTemplate);
  const separator = makeSeparator('-');
  const strongSeparator = makeSeparator('=');
  const lines: string[] = [];
  lines.push(strongSeparator);
  lines.push(centerLine((settings as any)?.restaurantName ? String((settings as any).restaurantName) : 'Ticket client'));
  lines.push(tpl === 'MODERN' ? 'Modele: MODERN' : tpl === 'COMPACT' ? 'Modele: COMPACT' : 'Modele: CLASSIC');
  lines.push(headerText || '');
  lines.push(show('showTicketNumber', true) ? `Ticket ${ticket.code}` : '');
  lines.push(order?.ticketNumber ? `Commande ${order.ticketNumber}` : '');
  lines.push(show('showTable', true) && order?.tableNumber ? `Table: ${order.tableNumber}` : '');
  lines.push(show('showServer', true) && order?.serverName ? `Serveur: ${order.serverName}` : '');
  lines.push(show('showPaymentMethod', true) && paymentMethod ? `Paiement: ${paymentMethod}` : '');
  lines.push(show('showDate', true) ? `Date: ${formatPrintableDate((ticket as any)?.createdAt)}` : '');
  lines.push(show('showAddress', true) && (settings as any)?.address ? `Adresse: ${String((settings as any).address)}` : '');
  lines.push(show('showPhone', true) && (settings as any)?.phone ? `Tel: ${String((settings as any).phone)}` : '');
  lines.push(show('showTaxId', true) && (settings as any)?.taxId ? `MF: ${String((settings as any).taxId)}` : '');
  lines.push(separator);
  lines.push(`${padRight('Qte/Article', 22)} ${padLeft('Montant', 8)}`);
  lines.push(separator);
  for (const row of itemRows) lines.push(row);
  lines.push(separator);
  lines.push(show('showPriceHt', true) ? `Sous-total: ${sum.toFixed(3)} ${currency}` : '');
  lines.push(show('showTicketDiscount', true) && Number((ticket as any)?.discount || 0) > 0
    ? `Remise: -${Number((ticket as any)?.discount || 0).toFixed(3)} ${currency}`
    : '');
  const timbreValue = Number((ticket as any)?.timbre ?? (order as any)?.timbre ?? 0);
  lines.push(show('showTimbre', true)
    ? `Timbre: ${timbreValue.toFixed(3)} ${currency}`
    : '');
  lines.push(show('showPriceTtc', true) ? `Total TTC: ${Number((ticket as any)?.total || sum).toFixed(3)} ${currency}` : '');
  if (nacefTemplateActive) {
    lines.push(separator);
    lines.push(`NACEF: ${String((ticket as any)?.fiscalStatus || 'PENDING').toUpperCase()}`);
    if ((ticket as any)?.fiscalMode) lines.push(`Mode: ${String((ticket as any).fiscalMode).toUpperCase()}`);
    if ((ticket as any)?.fiscalImdf) lines.push(`IMDF: ${String((ticket as any).fiscalImdf)}`);
    if ((ticket as any)?.fiscalErrorCode) lines.push(`Erreur: ${String((ticket as any).fiscalErrorCode)}`);
    if ((ticket as any)?.fiscalQrPayload) lines.push(`QR: ${String((ticket as any).fiscalQrPayload).slice(0, 120)}...`);
  }
  if (typeof amount === 'number') {
    lines.push(`Règlement: ${amount.toFixed(3)} ${currency} ${paymentMethod ? `(${paymentMethod})` : ''}`);
  }
  lines.push(footerText || '');
  lines.push(`${strongSeparator}\n`);
  return lines.filter(Boolean).join('\n');
};

const renderReceiptPdfDocument = (
  doc: any,
  settings: any,
  order: any,
  ticket: Ticket,
  items: TicketItem[],
  paymentMethod?: string,
  amount?: number,
) => {
  const nacefTemplateActive = isNacefPrintTemplateActive(settings);
  const nacefPayload = parseFiscalPayloadJson(ticket);
  const tpl = nacefTemplateActive
    ? 'CLASSIC'
    : normalizeTicketTemplate((settings as any)?.clientTicketTemplate);
  const layout = (settings as any)?.clientTicketLayout || {};
  const show = (key: string, defaultValue = true) =>
    nacefTemplateActive
      ? true
      : layout?.[key] !== undefined
        ? Boolean(layout[key])
        : defaultValue;
  const currency = String((settings as any)?.currency || 'DT').trim();
  const title = String((settings as any)?.restaurantName || 'Ticket client').trim();

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const compact = tpl === 'COMPACT';
  const modern = tpl === 'MODERN';
  if (nacefTemplateActive) {
    const strictText = buildNacefStrictReceiptText(nacefPayload || {}, ticket, currency);
    doc.fillColor('#111827').font(compact ? 'Courier' : 'Helvetica').fontSize(compact ? 8 : 9).text(strictText, {
      width,
      align: 'left',
      lineGap: 1.2,
    });
    return;
  }

  if (modern) {
    const y = doc.y;
    doc.roundedRect(left, y, width, 56, 12).fill('#EEF2FF');
    doc.fillColor('#1E1B4B').font('Helvetica-Bold').fontSize(15).text(title, left + 12, y + 10);
    const headerText = String(layout?.headerText || '').trim();
    if (headerText) {
      doc.fillColor('#4338CA').font('Helvetica').fontSize(9).text(headerText, left + 12, y + 30);
    }
    doc.moveDown(3.4);
  } else {
    doc.fillColor('#111827').font(compact ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(compact ? 11 : 13).text(title, { align: 'center' });
    const headerText = String(layout?.headerText || '').trim();
    if (headerText) doc.font(compact ? 'Courier' : 'Helvetica').fontSize(compact ? 8 : 9).text(headerText, { align: 'center' });
    doc.moveDown(0.4);
  }

  doc.fillColor('#0F172A').font(compact ? 'Courier' : 'Helvetica').fontSize(compact ? 8 : 9);
  if (show('showTicketNumber', true)) doc.text(`Ticket: ${ticket.code}`);
  if (order?.ticketNumber) doc.text(`Commande: ${order.ticketNumber}`);
  if (show('showDate', true)) doc.text(`Date: ${formatPrintableDate((ticket as any)?.createdAt)}`);
  if (show('showTable', true) && order?.tableNumber) doc.text(`Table: ${order.tableNumber}`);
  if (show('showServer', true) && order?.serverName) doc.text(`Serveur: ${order.serverName}`);
  if (show('showPaymentMethod', true) && paymentMethod) doc.text(`Paiement: ${paymentMethod}`);
  doc.moveDown(0.3);
  doc.strokeColor('#CBD5E1').moveTo(left, doc.y).lineTo(left + width, doc.y).stroke();
  doc.moveDown(0.3);

  let subtotal = 0;
  for (const it of items) {
    const qty = Number((it as any).quantity || 0);
    const unit = Number((it as any).unitPrice || 0);
    const total = qty * unit;
    subtotal += total;
    doc.font(compact ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(compact ? 8 : 9).fillColor('#111827').text(String((it as any).name || 'Article'));
    if (show('showItemUnitPrice', true)) {
      doc.font(compact ? 'Courier' : 'Helvetica').fontSize(compact ? 8 : 9).fillColor('#334155').text(`x${qty} @ ${unit.toFixed(3)} = ${total.toFixed(3)} ${currency}`);
    } else {
      doc.font(compact ? 'Courier' : 'Helvetica').fontSize(compact ? 8 : 9).fillColor('#334155').text(`x${qty} = ${total.toFixed(3)} ${currency}`);
    }
    doc.moveDown(0.15);
  }

  doc.moveDown(0.3);
  doc.strokeColor('#CBD5E1').moveTo(left, doc.y).lineTo(left + width, doc.y).stroke();
  doc.moveDown(0.4);
  doc.fillColor('#0F172A').font(compact ? 'Courier' : 'Helvetica').fontSize(compact ? 8 : 9);
  if (show('showPriceHt', true)) doc.text(`Sous-total: ${subtotal.toFixed(3)} ${currency}`);
  if (show('showTicketDiscount', true) && Number((ticket as any)?.discount || 0) > 0) {
    doc.text(`Remise: -${Number((ticket as any).discount || 0).toFixed(3)} ${currency}`);
  }
  const timbreValue = Number((ticket as any)?.timbre ?? (order as any)?.timbre ?? 0);
  if (show('showTimbre', true)) {
    doc.text(`Timbre: ${timbreValue.toFixed(3)} ${currency}`);
  }
  if (show('showPriceTtc', true)) {
    doc.font(compact ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(compact ? 9 : 10).text(`TOTAL TTC: ${Number((ticket as any)?.total || subtotal).toFixed(3)} ${currency}`);
  }
  if (typeof amount === 'number') doc.font(compact ? 'Courier' : 'Helvetica').fontSize(compact ? 8 : 9).text(`Règlement: ${amount.toFixed(3)} ${currency}`);
  if (nacefTemplateActive) {
    doc.moveDown(0.4);
    doc.strokeColor('#CBD5E1').moveTo(left, doc.y).lineTo(left + width, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fillColor('#111827').font(compact ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(compact ? 8 : 9).text('Bloc fiscal NACEF');
    doc.font(compact ? 'Courier' : 'Helvetica').fontSize(compact ? 8 : 9);
    doc.text(`Statut: ${String((ticket as any)?.fiscalStatus || 'PENDING').toUpperCase()}`);
    if ((ticket as any)?.fiscalMode) doc.text(`Mode: ${String((ticket as any).fiscalMode).toUpperCase()}`);
    if ((ticket as any)?.fiscalImdf) doc.text(`IMDF: ${String((ticket as any).fiscalImdf)}`);
    if ((ticket as any)?.fiscalErrorCode) doc.text(`Code erreur: ${String((ticket as any).fiscalErrorCode)}`);
    if ((ticket as any)?.fiscalQrPayload) {
      doc.text(`QR payload: ${String((ticket as any).fiscalQrPayload).slice(0, 220)}`);
    }
  }
  const footerText = String(layout?.footerText || '').trim();
  if (footerText) {
    doc.moveDown(0.6);
    doc.fillColor('#475569').font(compact ? 'Courier' : 'Helvetica-Oblique').fontSize(compact ? 7 : 8).text(footerText, { align: 'center' });
  }
};

export async function getTicketPdfBuffer(ticketId: string) {
  const settings = await getSettings();
  const tRepo = AppDataSource.getRepository(Ticket);
  const ticket = await tRepo.findOne({
    where: { id: ticketId } as any,
    relations: ['order'] as any,
  });
  if (!ticket) throw new Error('Ticket not found');
  const orderRepo = AppDataSource.getRepository<any>('Order');
  const linkedOrderId = String((ticket as any)?.order?.id || '').trim();
  const order = linkedOrderId
    ? await orderRepo.findOne({ where: { id: linkedOrderId } as any })
    : null;
  const tiRepo = AppDataSource.getRepository(TicketItem);
  const items = await tiRepo.find({ where: { ticket: { id: ticket.id } } as any });
  const style = getPdfTemplateStyle((settings as any)?.clientTicketTemplate);
  const doc = new (PDFDocument as any)({ size: style.size, margin: style.margin });
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    (doc as any).on('data', (chunk: Buffer) => chunks.push(chunk));
    (doc as any).on('end', () => resolve());
    (doc as any).on('error', reject);
    renderReceiptPdfDocument(doc, settings, order, ticket, items);
    (doc as any).end();
  });
  return {
    fileName: `${sanitizeFileName(String((ticket as any).code || 'ticket'))}.pdf`,
    buffer: Buffer.concat(chunks),
  };
};

export async function printOrderItemsByPrinter(
	order: any,
	options?: { titleOverride?: string },
) {
	await ensureExternalTemplatesDirectory();
	const items: PrintItem[] = Array.isArray(order?.items) ? order.items : [];
	if (!items.length) return;
  console.info(
    `[print] production-request order=${String(
      order?.ticketNumber || order?.id || 'N/A',
    )} items=${items.length}`,
  );

	const productRepo = AppDataSource.getRepository(Product);
	const printerRepo = AppDataSource.getRepository(Printer);

	const productIds = Array.from(
		new Set(items.map((i) => i.productId).filter(Boolean) as string[]),
	);
	const products = productIds.length
		? await productRepo.findBy({ id: In(productIds) } as any)
		: [];
	const printers = await printerRepo.find();

	const printersById = new Map(printers.map((p) => [p.id, p]));
	const productById = new Map(products.map((p) => [p.id, p]));
  const settings = await getSettings();
  const templates = (settings as any)?.kitchenBarPrintTemplates || {};

	const groups = new Map<string, PrintItem[]>();
	let printed = false;

	items.forEach((item) => {
		if (!item.productId) return;
		const product = productById.get(item.productId);
		const rawPrinterIds = Array.isArray(product?.printerIds)
			? product?.printerIds
			: [];
    const printerIds = rawPrinterIds.filter((pid) => {
      const p = printersById.get(String(pid));
      if (!p) return false;
      const pType = String((p as any).type || '').toUpperCase();
      return pType !== 'RECEIPT';
    });
		if (!printerIds.length) {
      const wantedProfile = inferProductionProfileFromItemAndProduct(item, product);
      const fallbackPrinter = printers.find((p) => {
        const pType = String((p as any).type || '').toUpperCase();
        if (pType === 'RECEIPT') return false;
        return resolvePrinterBonProfile(p) === wantedProfile;
      });
      if (!fallbackPrinter?.id) return;
      const list = groups.get(fallbackPrinter.id) || [];
      list.push(item);
      groups.set(fallbackPrinter.id, list);
      return;
    }

		printerIds.forEach((pid) => {
			const list = groups.get(pid) || [];
			list.push(item);
			groups.set(pid, list);
		});
	});

	for (const [printerId, list] of groups.entries()) {
		const printer = printersById.get(printerId);
		if (!printer?.name) continue;
    const pType = String((printer as any).type || '').toUpperCase();
    if (pType === 'RECEIPT') continue;
    const profile = resolvePrinterBonProfile(printer);
    const isBar = profile === 'bar';
    const tpl = isBar
      ? templates?.bar || {}
      : templates?.kitchen || {};
    const orderRef = resolveOrderReference(order);
    const headerLines = [
      String(options?.titleOverride || tpl?.title || (isBar ? 'BON BAR' : 'BON CUISINE')),
      tpl?.showOrderRef !== false ? `Commande #${orderRef}` : '',
      `Type: ${order?.type || ''}`,
      tpl?.showTable !== false && order?.tableNumber
        ? `Table: ${order.tableNumber}`
        : '',
      tpl?.showServer !== false && order?.serverName
        ? `Serveur: ${order.serverName}`
        : '',
      tpl?.showTime !== false
        ? `Heure: ${formatPrintableDate(order?.createdAt || Date.now())}`
        : '',
      makeSeparator('-'),
      `${padRight('Qte/Article', 24)} ${padLeft('Note', 6)}`,
      makeSeparator('-'),
    ].filter(Boolean);
		const bodyLines = list.map((it) => formatLineWithTemplate(it, tpl));
    const footerLine = String(tpl?.footerText || '').trim();
    const designerHtml = getDesignerTemplateHtml(settings, isBar ? 'bar' : 'kitchen');
    const productionSource = getPrintTemplateSource(
      settings,
      isBar ? 'bar' : 'kitchen',
    );
    console.info(
      `[print] production-template station=${isBar ? 'bar' : 'kitchen'} source=${
        productionSource === 'DESIGNER' && designerHtml
          ? 'designer-html'
          : 'builtin'
      } order=${String(order?.ticketNumber || order?.id || 'N/A')}`,
    );
    let text = [...headerLines, ...bodyLines, footerLine, '\n'].filter(Boolean).join('\n');
    let renderedHtmlForBridge = '';
    if (productionSource === 'DESIGNER' && designerHtml) {
      try {
        const rendered = renderExternalClientTemplate(String(designerHtml || ''), {
          title: String(options?.titleOverride || tpl?.title || (isBar ? 'BON BAR' : 'BON CUISINE')),
          orderNumber: String(order?.ticketNumber || ''),
          orderRef: String(orderRef || ''),
          tableNumber: String(order?.tableNumber || ''),
          serverName: String(order?.serverName || ''),
          createdAt: String(new Date(order?.createdAt || Date.now()).toLocaleString()),
          orderType: String(order?.type || ''),
          itemsLines: bodyLines.join('\n'),
          footerText: footerLine,
        });
        renderedHtmlForBridge = String(rendered || '');
        text = htmlToPlainText(rendered);
      } catch {
        // keep standard text
      }
    }
    const stationFolder = isBar ? 'bar' : 'cuisine';
    void saveCategorizedPdf({
      categoryPath: ['tickets_preparation', stationFolder],
      prefix: `${stationFolder}-${String(order?.ticketNumber || order?.id || 'commande')}`,
      text,
      fixedFileName: `${String(order?.ticketNumber || order?.id || 'commande')}-${stationFolder}-${Date.now()}`,
      ticketTemplate: (settings as any)?.clientTicketTemplate,
    }).catch(() => undefined);
    if (isDesktopBridgeMode(settings)) {
      const bridgePayload = {
        kind: 'production',
        station: isBar ? 'bar' : 'kitchen',
        printerName: String(printer.name || ''),
        order: {
          id: String(order?.id || ''),
          ticketNumber: String(order?.ticketNumber || ''),
          type: String(order?.type || ''),
          tableNumber: String(order?.tableNumber || ''),
          serverName: String(order?.serverName || ''),
          createdAt: formatPrintableDate(order?.createdAt || Date.now()),
        },
        items: list.map((it: any) => ({
          name: String(it?.name || 'Article'),
          quantity: Number(it?.quantity || 0),
          notes: String(it?.notes || ''),
        })),
        renderedText: text,
        renderedHtml: renderedHtmlForBridge || undefined,
      };
      await postDesktopBridgeJob(settings, bridgePayload);
      console.info(
        `[print] desktop-bridge production station=${isBar ? 'bar' : 'cuisine'} order=${String(
          order?.ticketNumber || order?.id || 'N/A',
        )}`,
      );
      printed = true;
      continue;
    }
    try {
      if (getPrintTemplateSource(settings, isBar ? 'bar' : 'kitchen') === 'DESIGNER' && designerHtml) {
        const renderedHtml = renderExternalClientTemplate(String(designerHtml || ''), {
          title: String(options?.titleOverride || tpl?.title || (isBar ? 'BON BAR' : 'BON CUISINE')),
          orderNumber: String(order?.ticketNumber || ''),
          orderRef: String(orderRef || ''),
          tableNumber: String(order?.tableNumber || ''),
          serverName: String(order?.serverName || ''),
          createdAt: formatPrintableDate(order?.createdAt || Date.now()),
          orderType: String(order?.type || ''),
          itemsLines: bodyLines.join('\n'),
          footerText: footerLine,
        });
        const htmlPath = path.join(
          process.cwd(),
          'tmp',
          `prod-designer-${isBar ? 'bar' : 'kitchen'}-${Date.now()}.html`,
        );
        await fs.mkdir(path.dirname(htmlPath), { recursive: true });
        await fs.writeFile(htmlPath, renderedHtml, 'utf8');
        await printHtml(printer.name, htmlPath, {
          terminalNodeId: (printer as any).terminalNodeId || null,
          terminalPrinterLocalId: (printer as any).terminalPrinterLocalId || null,
        });
        await fs.unlink(htmlPath).catch(() => undefined);
      } else {
        // Browser popup: styled production ticket
        const bonHtml = wrapHtmlForPrint(
          printer.name,
          buildProductionHtmlBody(isBar, tpl, order, list, options?.titleOverride),
        );
        await printViaLocalBrowser(printer.name, bonHtml, `bon-${isBar ? 'bar' : 'cuisine'}`, {
          terminalNodeId: (printer as any).terminalNodeId || null,
          terminalPrinterLocalId: (printer as any).terminalPrinterLocalId || null,
        }, {
          kind: isBar ? 'bar' : 'kitchen',
          data: {
            title: String(options?.titleOverride || tpl?.title || (isBar ? 'BON BAR' : 'BON CUISINE')),
            orderNumber: String(order?.ticketNumber || ''),
            orderRef: String(orderRef || ''),
            tableNumber: String(order?.tableNumber || ''),
            serverName: String(order?.serverName || ''),
            createdAt: formatPrintableDate(order?.createdAt || Date.now()),
            orderType: String(order?.type || ''),
            items: list.map((it: any) => ({
              name: String(it?.name || 'Article'),
              quantity: Number(it?.quantity || 0),
              notes: String(it?.notes || ''),
            })),
            footerText: footerLine,
          } as any,
        });
      }
    } catch (err) {
      console.warn(`[print] production popup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
		console.info(
			`[print] production=1 station=${isBar ? 'bar' : 'cuisine'} order=${String(
				order?.ticketNumber || order?.id || 'N/A',
			)} printer=${String(printer.name || 'N/A')}`,
		);
		printed = true;
	}
	if (!printed) {
    console.warn(
      `[print] production-no-grouped-printer order=${String(
        order?.ticketNumber || order?.id || 'N/A',
      )} trying-fallback-printer`,
    );
		const fallbackLines = [
			'BON PRODUCTION (PDF)',
			resolveOrderReference(order) ? `Commande #${resolveOrderReference(order)}` : '',
			`Type: ${order?.type || ''}`,
			order?.tableNumber ? `Table: ${order.tableNumber}` : '',
			order?.serverName ? `Serveur: ${order.serverName}` : '',
      `Heure: ${formatPrintableDate(order?.createdAt || Date.now())}`,
      makeSeparator('-'),
			...items.map((it) => formatLine(it)),
			'',
		].filter(Boolean).join('\n');
    const fallbackPrinter = printers.find(
      (p) => String((p as any).type || '').toUpperCase() !== 'RECEIPT',
    );
    if (fallbackPrinter?.name) {
      try {
        await printText(fallbackPrinter.name, fallbackLines, {
          terminalNodeId: (fallbackPrinter as any).terminalNodeId || null,
          terminalPrinterLocalId: (fallbackPrinter as any).terminalPrinterLocalId || null,
        });
        console.warn(
          `[print] Fallback production dispatch on first printer: ${String(
            fallbackPrinter.name,
          )}`,
        );
        printed = true;
      } catch {
        // continue to PDF-only fallback below
      }
    }
		const savedPdf = await saveCategorizedPdf({
      categoryPath: ['tickets_preparation', 'fallback'],
      prefix: 'production-fallback',
      text: fallbackLines,
      fixedFileName: `production-fallback-${String(order?.ticketNumber || order?.id || Date.now())}`,
      ticketTemplate: (settings as any)?.clientTicketTemplate,
    });
		console.warn(`[print] Aucune imprimante production disponible. PDF: ${savedPdf}`);
	}
}

export async function printPaymentReceipt(
  order: any,
  ticket: Ticket,
  paymentMethod?: string,
  amount?: number,
  options?: { copies?: number },
) {
  await ensureExternalTemplatesDirectory();
  const settings = await getSettings();
  assertNacefPrintReady(settings);
  const printerRepo = AppDataSource.getRepository(Printer);
  const tiRepo = AppDataSource.getRepository(TicketItem);
  const printers = await printerRepo.find();
  const receipt = printers.find((p) => String(p.type).toUpperCase() === 'RECEIPT');
  const items = await tiRepo.find({ where: { ticket: { id: ticket.id } } as any });
  const effectivePaymentMethod =
    String(paymentMethod || (ticket as any)?.paymentMethod || (order as any)?.paymentMethod || '')
      .trim() || undefined;
  const text = buildReceiptText(
    settings,
    order,
    ticket,
    items,
    effectivePaymentMethod,
    amount,
  );
  const ticketCode = String(ticket.code || order?.ticketNumber || 'ticket');
  const methodFolder = sanitizeFileName(
    String(effectivePaymentMethod || 'UNKNOWN').toUpperCase(),
    'UNKNOWN',
  );
  const baseDir = resolveArchiveBaseDirectory(settings);
  const targetDir = path.join(baseDir, 'tickets_client', methodFolder);
  await fs.mkdir(targetDir, { recursive: true });
  const designerClientHtml = getDesignerTemplateHtml(settings, 'client');
  const clientSource = getPrintTemplateSource(settings, 'client');
  const nacefTemplateActive = isNacefPrintTemplateActive(settings);
  const assignedName = await resolvePhysicalPrinterNameForOrderServer(order);
  const printTarget = assignedName || receipt?.name;
  if (!printTarget) {
    console.warn(
      `[print] Aucune imprimante : ni affectation serveur, ni imprimante caisse globale. Dossier archive: ${targetDir}`,
    );
    return;
  }
  const mapped = printers.find((p: any) => String(p.name || '') === String(printTarget || ''));
  const copies = Math.max(
    1,
    Math.min(10, Math.floor(Number((options as any)?.copies || 1))),
  );
  console.info(
    `[print] clientCopies=${copies} template=${normalizeTicketTemplate(
      (settings as any)?.clientTicketTemplate,
    )} source=${clientSource} production=1(bar)+1(cuisine) order=${String(
      order?.ticketNumber || order?.id || 'N/A',
    )} printer=${String(printTarget || 'N/A')}`,
  );
  for (let i = 0; i < copies; i += 1) {
    if (isDesktopBridgeMode(settings)) {
      let renderedHtmlForBridge = '';
      const nacefTemplateActive = isNacefPrintTemplateActive(settings);
      if (nacefTemplateActive) {
        renderedHtmlForBridge = buildModelReceiptHtml(
          printTarget,
          settings,
          order,
          ticket,
          items,
          effectivePaymentMethod,
          amount,
        );
      } else if (clientSource === 'DESIGNER' && designerClientHtml) {
        try {
          renderedHtmlForBridge = renderExternalClientTemplate(
            String(designerClientHtml || ''),
            buildClientTemplateData(
              settings,
              order,
              ticket,
              items,
              effectivePaymentMethod,
              amount,
            ),
          );
        } catch {
          renderedHtmlForBridge = '';
        }
      } else {
        renderedHtmlForBridge = buildModelReceiptHtml(
          printTarget,
          settings,
          order,
          ticket,
          items,
          effectivePaymentMethod,
          amount,
        );
      }
      const bridgePayload = {
        kind: 'client',
        copyIndex: i + 1,
        copies,
        printerName: String(printTarget || ''),
        order: {
          id: String(order?.id || ''),
          ticketNumber: String(order?.ticketNumber || ''),
          tableNumber: String(order?.tableNumber || ''),
          serverName: String(order?.serverName || ''),
        },
        ticket: {
          code: String(ticket.code || ''),
          createdAt: formatPrintableDate((ticket as any)?.createdAt),
          paymentMethod: String(effectivePaymentMethod || ''),
          amount: typeof amount === 'number' ? Number(amount) : null,
          total: Number((ticket as any)?.total || 0),
          currency: String((settings as any)?.currency || 'DT'),
        },
        items: items.map((it: any) => ({
          name: String(it?.name || 'Article'),
          quantity: Number(it?.quantity || 0),
          unitPrice: Number(it?.unitPrice || 0),
          total: Number(it?.total || 0),
        })),
        renderedText: text,
        renderedHtml: renderedHtmlForBridge || undefined,
      };
      await postDesktopBridgeJob(settings, bridgePayload);
      continue;
    }
    try {
      if (!nacefTemplateActive && getPrintTemplateSource(settings, 'client') === 'DESIGNER' && designerClientHtml) {
        const renderedHtml = renderExternalClientTemplate(
          String(designerClientHtml || ''),
          buildClientTemplateData(
            settings,
            order,
            ticket,
            items,
            effectivePaymentMethod,
            amount,
          ),
        );
        const htmlPath = path.join(
          process.cwd(),
          'tmp',
          `client-designer-${sanitizeFileName(ticketCode, 'ticket')}-${Date.now()}.html`,
        );
        await fs.mkdir(path.dirname(htmlPath), { recursive: true });
        await fs.writeFile(htmlPath, renderedHtml, 'utf8');
        await printHtml(printTarget, htmlPath, {
          terminalNodeId: (mapped as any)?.terminalNodeId || null,
          terminalPrinterLocalId: (mapped as any)?.terminalPrinterLocalId || null,
        });
        await fs.unlink(htmlPath).catch(() => undefined);
      } else {
        // Browser popup: card-style model receipt (matches settings live preview)
        const receiptHtml = buildModelReceiptHtml(
          printTarget,
          settings,
          order,
          ticket,
          items,
          effectivePaymentMethod,
          amount,
        );
        await printViaLocalBrowser(printTarget, receiptHtml, `receipt-${sanitizeFileName(ticketCode, 'ticket')}`, {
          terminalNodeId: (mapped as any)?.terminalNodeId || null,
          terminalPrinterLocalId: (mapped as any)?.terminalPrinterLocalId || null,
        }, {
          kind: nacefTemplateActive ? 'client_nacef' : 'client_default',
          data: buildClientTemplateData(
            settings,
            order,
            ticket,
            items,
            effectivePaymentMethod,
            amount,
          ) as any,
        });
      }
    } catch (err) {
      console.warn(`[print] receipt popup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Archive PDF in background to avoid delaying thermal output.
  void (async () => {
    const pdfPath = path.join(targetDir, `${sanitizeFileName(ticketCode, 'ticket')}.pdf`);
    const style = getPdfTemplateStyle((settings as any)?.clientTicketTemplate);
    await new Promise<void>((resolve, reject) => {
      const doc = new (PDFDocument as any)({ size: style.size, margin: style.margin });
      const stream = createWriteStream(pdfPath);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      (doc as any).on('error', reject);
      (doc as any).pipe(stream);
      renderReceiptPdfDocument(
        doc,
        settings,
        order,
        ticket,
        items,
        effectivePaymentMethod,
        amount,
      );
      (doc as any).end();
    });
    await savePdfArchiveFromFile({
      category: 'tickets_client',
      relativePath: path.relative(baseDir, pdfPath),
      absolutePath: pdfPath,
    }).catch(() => undefined);
    console.info(`[print] Reçu PDF sauvegardé: ${pdfPath}`);
  })().catch(() => undefined);
}

export async function printTicket(ticketId: string, options?: { copies?: number }) {
  const tRepo = AppDataSource.getRepository(Ticket);
  const ticket = await tRepo.findOne({
    where: { id: ticketId } as any,
    relations: ['order'] as any,
  });
  if (!ticket) return;
  const orderRepo = AppDataSource.getRepository<any>('Order');
  const linkedOrderId = String((ticket as any)?.order?.id || '').trim();
  const order = linkedOrderId
    ? await orderRepo.findOne({ where: { id: linkedOrderId } as any })
    : null;
  if (!order) {
    throw new Error('Order not found for ticket');
  }
  await printPaymentReceipt(order, ticket, undefined, undefined, options);
}

/**
 * Ticket client sans ligne Ticket en base (commande en cours / pas encore d'encaissement).
 * Même rendu PDF + impression que le ticket définitif (paramètres clientTicketTemplate / Layout).
 */
export async function  printProvisionalClientReceipt(orderId: string) {
  const orderRepo = AppDataSource.getRepository<any>('Order');
  const oiRepo = AppDataSource.getRepository(OrderItem);
  const order = await orderRepo.findOne({ where: { id: orderId } as any });
  if (!order) throw new Error('Order not found');
  const orderItems = await oiRepo.find({ where: { order: { id: orderId } } as any });
  if (!orderItems.length) throw new Error('Order has no items');

  const settings = await getSettings();
  const printerRepo = AppDataSource.getRepository(Printer);
  const printers = await printerRepo.find();
  const receipt = printers.find((p) => String(p.type).toUpperCase() === 'RECEIPT');

  const ticketCode = `PROV-${String((order as any).ticketNumber || String(orderId).slice(-8))}`;
  const fakeTicket = {
    code: ticketCode,
    createdAt: Number((order as any).createdAt || Date.now()),
    total: Number((order as any).total || 0),
    discount: Number((order as any).discount || 0),
    timbre: Number((order as any).timbre || 0),
  } as Ticket;

  const fakeItems: TicketItem[] = orderItems.map((oi: any) => {
    const qty = Number(oi.quantity || 0);
    const unit = Number(oi.unitPrice ?? oi.price ?? 0);
    return {
      name: String(oi.name || 'Article'),
      quantity: qty,
      unitPrice: unit,
      total: qty * unit,
    } as TicketItem;
  });

  const paymentMethod = 'EN_COURS';
  const text = buildReceiptText(settings, order, fakeTicket, fakeItems, paymentMethod, undefined);

  const methodFolder = sanitizeFileName('PREVIEW', 'PREVIEW');
  const baseDir = resolveArchiveBaseDirectory(settings);
  const targetDir = path.join(baseDir, 'tickets_client', methodFolder);
  await fs.mkdir(targetDir, { recursive: true });
  const pdfPath = path.join(targetDir, `${sanitizeFileName(ticketCode, 'ticket')}-${Date.now()}.pdf`);
  const style = getPdfTemplateStyle((settings as any)?.clientTicketTemplate);
  await new Promise<void>((resolve, reject) => {
    const doc = new (PDFDocument as any)({ size: style.size, margin: style.margin });
    const stream = createWriteStream(pdfPath);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    (doc as any).on('error', reject);
    (doc as any).pipe(stream);
    renderReceiptPdfDocument(doc, settings, order, fakeTicket, fakeItems, paymentMethod, undefined);
    (doc as any).end();
  });
  console.info(`[print] Reçu provisoire PDF sauvegardé: ${pdfPath}`);
  await savePdfArchiveFromFile({
    category: 'tickets_client',
    relativePath: path.relative(baseDir, pdfPath),
    absolutePath: pdfPath,
  }).catch(() => undefined);
  const assignedName = await resolvePhysicalPrinterNameForOrderServer(order);
  const printTarget = assignedName || receipt?.name;
  if (!printTarget) {
    console.warn(
      `[print] Aucune imprimante : ni affectation serveur, ni imprimante caisse globale. PDF: ${pdfPath}`,
    );
    return;
  }
  const mapped = printers.find((p: any) => String(p.name || '') === String(printTarget || ''));
  const designerClientHtml = getDesignerTemplateHtml(settings, 'client');
  const clientSource = getPrintTemplateSource(settings, 'client');
  const nacefTemplateActive = isNacefPrintTemplateActive(settings);
  if (isDesktopBridgeMode(settings)) {
    let renderedHtmlForBridge = '';
    const nacefTemplateActive = isNacefPrintTemplateActive(settings);
    if (nacefTemplateActive) {
      renderedHtmlForBridge = buildModelReceiptHtml(
        printTarget,
        settings,
        order,
        fakeTicket,
        fakeItems,
        paymentMethod,
        undefined,
      );
    } else if (clientSource === 'DESIGNER' && designerClientHtml) {
      try {
        renderedHtmlForBridge = renderExternalClientTemplate(
          String(designerClientHtml || ''),
          buildClientTemplateData(settings, order, fakeTicket, fakeItems, undefined),
        );
      } catch {
        renderedHtmlForBridge = '';
      }
    } else {
      renderedHtmlForBridge = buildModelReceiptHtml(
        printTarget,
        settings,
        order,
        fakeTicket,
        fakeItems,
        paymentMethod,
        undefined,
      );
    }
    await postDesktopBridgeJob(settings, {
      kind: 'client',
      copyIndex: 1,
      copies: 1,
      printerName: String(printTarget || ''),
      order: {
        id: String(order?.id || ''),
        ticketNumber: String(order?.ticketNumber || ''),
        tableNumber: String(order?.tableNumber || ''),
        serverName: String(order?.serverName || ''),
      },
      ticket: {
        code: String(fakeTicket.code || ''),
        createdAt: formatPrintableDate((fakeTicket as any)?.createdAt),
        paymentMethod,
        amount: null,
        total: Number((fakeTicket as any)?.total || 0),
        currency: String((settings as any)?.currency || 'DT'),
      },
      items: fakeItems.map((it: any) => ({
        name: String(it?.name || 'Article'),
        quantity: Number(it?.quantity || 0),
        unitPrice: Number(it?.unitPrice || 0),
        total: Number(it?.total || 0),
      })),
      renderedText: text,
      renderedHtml: renderedHtmlForBridge || undefined,
    });
    return;
  }
  try {
    if (!nacefTemplateActive && getPrintTemplateSource(settings, 'client') === 'DESIGNER' && designerClientHtml) {
      const renderedHtml = renderExternalClientTemplate(
        String(designerClientHtml || ''),
        buildClientTemplateData(settings, order, fakeTicket, fakeItems, undefined),
      );
      const htmlPath = path.join(
        process.cwd(),
        'tmp',
        `client-designer-${sanitizeFileName(ticketCode, 'ticket')}-${Date.now()}.html`,
      );
      await fs.mkdir(path.dirname(htmlPath), { recursive: true });
      await fs.writeFile(htmlPath, renderedHtml, 'utf8');
      await printHtml(printTarget, htmlPath, {
        terminalNodeId: (mapped as any)?.terminalNodeId || null,
        terminalPrinterLocalId: (mapped as any)?.terminalPrinterLocalId || null,
      });
      await fs.unlink(htmlPath).catch(() => undefined);
    } else {
      // Browser popup: provisional card-style receipt
      const provHtml = buildModelReceiptHtml(
        printTarget, settings, order, fakeTicket, fakeItems, paymentMethod, undefined,
      );
      await printViaLocalBrowser(printTarget, provHtml, `prov-receipt`, {
        terminalNodeId: (mapped as any)?.terminalNodeId || null,
        terminalPrinterLocalId: (mapped as any)?.terminalPrinterLocalId || null,
      }, {
        kind: nacefTemplateActive ? 'client_nacef' : 'client_default',
        data: buildClientTemplateData(
          settings,
          order,
          fakeTicket,
          fakeItems,
          paymentMethod,
          undefined,
        ) as any,
      });
    }
  } catch (err) {
    console.warn(`[print] provisional popup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function printProductionTest(opts: {
  printerId?: string;
  station?: 'KITCHEN' | 'BAR';
}) {
  const printerRepo = AppDataSource.getRepository(Printer);
  const printers = await printerRepo.find();
  const prodPrinters = printers.filter(
    (p) => String((p as any).type || '').toUpperCase() !== 'RECEIPT',
  );
  let target: Printer | undefined;
  if (opts.printerId) {
    target = prodPrinters.find((p) => p.id === opts.printerId);
  }
  if (!target) {
    const station = opts.station === 'BAR' ? 'BAR' : 'KITCHEN';
    const wantedProfile = station === 'BAR' ? 'bar' : 'kitchen';
    target = prodPrinters.find((p) => resolvePrinterBonProfile(p) === wantedProfile);
  }
  if (!target?.name) {
    throw new Error(
      opts.printerId
        ? 'Imprimante introuvable ou réservée à la caisse.'
        : opts.station === 'BAR'
          ? 'Aucune imprimante « style bar » configurée'
          : 'Aucune imprimante « style cuisine » configurée',
    );
  }

  const settings = await getSettings();
  const templates = ((settings as any)?.kitchenBarPrintTemplates || {}) as any;
  const isBar = resolvePrinterBonProfile(target) === 'bar';
  const tpl = isBar ? templates?.bar || {} : templates?.kitchen || {};
  const lines = [
    String(tpl?.title || (isBar ? 'BON BAR' : 'BON CUISINE')),
    tpl?.showOrderRef !== false ? 'Commande #TEST01' : '',
    tpl?.showTable !== false ? 'Table: TEST' : '',
    tpl?.showServer !== false ? 'Serveur: TEST' : '',
    tpl?.showTime !== false ? `Heure: ${new Date().toLocaleString()}` : '',
    '------------------------------',
    `- ${
      isBar ? 'Mojito' : 'Pizza Margherita'
    }${tpl?.showItemQty !== false ? ' x1' : ''}${
      tpl?.showItemNotes !== false ? ' (TEST)' : ''
    }`,
    String(tpl?.footerText || '').trim(),
    '',
  ].filter(Boolean);
  const designerHtml = getDesignerTemplateHtml(settings, isBar ? 'bar' : 'kitchen');
  if (getPrintTemplateSource(settings, isBar ? 'bar' : 'kitchen') === 'DESIGNER' && designerHtml) {
    const renderedHtml = renderExternalClientTemplate(String(designerHtml || ''), {
      title: String(tpl?.title || (isBar ? 'BON BAR' : 'BON CUISINE')),
      orderNumber: 'TEST01',
      orderRef: 'TEST01',
      tableNumber: 'TEST',
      serverName: 'TEST',
      createdAt: formatPrintableDate(Date.now()),
      orderType: 'TEST',
      itemsLines: isBar ? 'Mojito x1 (TEST)' : 'Pizza Margherita x1 (TEST)',
      footerText: String(tpl?.footerText || '').trim(),
    });
    const htmlPath = path.join(
      process.cwd(),
      'tmp',
      `prod-test-${isBar ? 'bar' : 'kitchen'}-${Date.now()}.html`,
    );
    await fs.mkdir(path.dirname(htmlPath), { recursive: true });
    await fs.writeFile(htmlPath, renderedHtml, 'utf8');
    try {
      await printHtml(target.name, htmlPath, {
        terminalNodeId: (target as any).terminalNodeId || null,
        terminalPrinterLocalId: (target as any).terminalPrinterLocalId || null,
      });
    } finally {
      await fs.unlink(htmlPath).catch(() => undefined);
    }
  } else {
    // Browser popup: test production ticket
    const testOrder = { id: 'TEST001', ticketNumber: 'TEST01', type: 'SUR_PLACE',
      tableNumber: 'TEST', serverName: 'TEST', createdAt: Date.now() };
    const testItems: PrintItem[] = [{
      name: isBar ? 'Mojito' : 'Pizza Margherita', quantity: 1,
      notes: tpl?.showItemNotes !== false ? 'TEST' : undefined,
    }];
    const testBonHtml = wrapHtmlForPrint(
      target.name,
      buildProductionHtmlBody(isBar, tpl, testOrder, testItems, undefined),
    );
    await printViaLocalBrowser(target.name, testBonHtml, `test-${isBar ? 'bar' : 'cuisine'}`, {
      terminalNodeId: (target as any).terminalNodeId || null,
      terminalPrinterLocalId: (target as any).terminalPrinterLocalId || null,
    }, {
      kind: isBar ? 'bar' : 'kitchen',
      data: {
        title: String(tpl?.title || (isBar ? 'BON BAR' : 'BON CUISINE')),
        orderRef: 'TEST01',
        tableNumber: 'TEST',
        serverName: 'TEST',
        createdAt: formatPrintableDate(Date.now()),
        items: [
          {
            name: isBar ? 'Mojito' : 'Pizza Margherita',
            quantity: 1,
            notes: tpl?.showItemNotes !== false ? 'TEST' : '',
          },
        ],
        footerText: String(tpl?.footerText || '').trim(),
      },
    });
  }
  return {
    ok: true,
    printer: target.name,
    printerId: target.id,
    profile: isBar ? 'bar' : 'kitchen',
  };
}

export async function printReceiptTest(opts: { printerId?: string }) {
  const printerRepo = AppDataSource.getRepository(Printer);
  const printers = await printerRepo.find();
  const receiptPrinters = printers.filter(
    (p) => String((p as any).type || '').toUpperCase() === 'RECEIPT',
  );
  let target: Printer | undefined;
  if (opts.printerId) {
    target = receiptPrinters.find((p) => p.id === opts.printerId);
  }
  if (!target) {
    target = receiptPrinters[0];
  }
  if (!target?.name) {
    throw new Error('Aucune imprimante ticket client (RECEIPT) configurée');
  }
  const now = new Date();
  const lines = [
    'TICKET CLIENT - TEST',
    `Heure: ${now.toLocaleString()}`,
    '------------------------------',
    'Article test x1  1.000',
    'TOTAL            1.000',
    '',
    'Merci et a bientot !',
    '',
  ];
  const settings = await getSettings();
  const designerHtml = getDesignerTemplateHtml(settings, 'client');
  const nacefTemplateActive = isNacefPrintTemplateActive(settings);
  if (!nacefTemplateActive && getPrintTemplateSource(settings, 'client') === 'DESIGNER' && designerHtml) {
    const renderedHtml = renderExternalClientTemplate(String(designerHtml || ''), {
      restaurantName: String((settings as any)?.restaurantName || 'AxiaFlex'),
      headerText: 'Ticket test',
      footerText: 'Merci et a bientot !',
      ticketCode: 'TK-TEST',
      orderNumber: 'OR-TEST',
      tableNumber: 'TEST',
      serverName: 'TEST',
      createdAt: formatPrintableDate(now),
      address: String((settings as any)?.address || ''),
      phone: String((settings as any)?.phone || ''),
      taxId: String((settings as any)?.taxId || ''),
      itemsLines: 'Article test x1',
      subtotal: '1.000',
      discount: '0.000',
      timbre: '0.000',
      total: '1.000',
      amount: '1.000',
      currency: String((settings as any)?.currency || 'DT'),
    });
    const htmlPath = path.join(process.cwd(), 'tmp', `client-test-${Date.now()}.html`);
    await fs.mkdir(path.dirname(htmlPath), { recursive: true });
    await fs.writeFile(htmlPath, renderedHtml, 'utf8');
    try {
      await printHtml(target.name, htmlPath, {
        terminalNodeId: (target as any).terminalNodeId || null,
        terminalPrinterLocalId: (target as any).terminalPrinterLocalId || null,
      });
    } finally {
      await fs.unlink(htmlPath).catch(() => undefined);
    }
  } else {
    // Browser popup: test receipt using exactly saved settings.
    const tSettings = settings;
    const tTicket = { code: 'TK-TEST', createdAt: Date.now(), total: 1, discount: 0.5, timbre: 0.3 } as Ticket;
    const tItems = [{ name: 'Article test', quantity: 1, unitPrice: 1, total: 1 } as TicketItem];
    const testReceiptHtml = buildModelReceiptHtml(
      target.name, tSettings,
      { ticketNumber: 'OR-TEST', tableNumber: 'TEST', serverName: 'TEST' },
      tTicket, tItems, 'ESPECES', 1,
    );
    await printViaLocalBrowser(target.name, testReceiptHtml, 'test-receipt', {
      terminalNodeId: (target as any).terminalNodeId || null,
      terminalPrinterLocalId: (target as any).terminalPrinterLocalId || null,
    }, {
      kind: nacefTemplateActive ? 'client_nacef' : 'client_default',
      data: {
        restaurantName: String((settings as any)?.restaurantName || 'AxiaFlex'),
        headerText: 'Ticket test',
        footerText: 'Merci et a bientot !',
        ticketCode: 'TK-TEST',
        orderNumber: 'OR-TEST',
        orderRef: 'OR-TEST',
        tableNumber: 'TEST',
        serverName: 'TEST',
        createdAt: formatPrintableDate(now),
        items: [{ name: 'Article test', quantity: 1, unitPrice: 1, total: 1 }],
        subtotal: '1.000',
        discount: '0.000',
        timbre: '0.000',
        total: '1.000',
        amount: '1.000',
        currency: String((settings as any)?.currency || 'DT'),
      } as any,
    });
  }
  return {
    ok: true,
    printer: target.name,
    printerId: target.id,
    profile: 'receipt',
  };
}

export async function buildPrintTemplatePreview(params: {
  kind: 'client' | 'kitchen' | 'bar';
  format: 'html' | 'pdf';
}) {
  await ensureExternalTemplatesDirectory();
  const settings = await getSettings();
  const kind = params.kind;
  const format = params.format;
  const source = getPrintTemplateSource(settings, kind);
  const designerHtml = getDesignerTemplateHtml(settings, kind);
  const productionTemplates = (settings as any)?.kitchenBarPrintTemplates || {};
  const productionTpl = kind === 'bar'
    ? productionTemplates?.bar || {}
    : productionTemplates?.kitchen || {};
  const sampleData = {
    restaurantName: String((settings as any)?.restaurantName || 'FORMULA 1'),
    headerText: String((settings as any)?.clientTicketLayout?.headerText || 'Aperçu modèle dynamique'),
    footerText: String(
      kind === 'client'
        ? ((settings as any)?.clientTicketLayout?.footerText || 'MERCI POUR VOTRE VISITE')
        : (productionTpl?.footerText || ''),
    ),
    ticketCode: 'TK-PREVIEW',
    orderNumber: 'OR-PREVIEW',
    orderRef: 'PREV01',
    tableNumber: 'A1',
    serverName: 'INES',
    createdAt: formatPrintableDate(Date.now()),
    address: 'Rue 20 Mars',
    phone: '55219947',
    taxId: '123456789',
    itemsLines:
      kind === 'client'
        ? 'AMERICANO x1\nCREAMY PASTA x1'
        : kind === 'bar'
          ? 'AMERICANO x1\nEAU MINERALE x2'
          : 'CREAMY PASTA x1\nCRISPY SANDWICH x1',
    subtotal: '27.000',
    discount: '0.000',
    timbre: '0.000',
    total: '27.000',
    amount: '27.000',
    currency: String((settings as any)?.currency || 'TND'),
    orderType: 'SUR_PLACE',
    title:
      String(
        productionTpl?.title ||
          (kind === 'bar'
            ? 'BON BAR'
            : kind === 'kitchen'
              ? 'BON CUISINE'
              : 'TICKET CLIENT'),
      ),
  };
  let renderedHtml = '';
  if (source === 'DESIGNER' && designerHtml) {
    renderedHtml = renderExternalClientTemplate(String(designerHtml || ''), sampleData);
  } else if (kind === 'client') {
    const fakeTicket = {
      code: 'TK-PREVIEW',
      createdAt: Date.now(),
      total: 27,
      discount: 0,
      timbre: 0,
    } as Ticket;
    const fakeItems = [
      { name: 'AMERICANO', quantity: 1, unitPrice: 9, total: 9 },
      { name: 'CREAMY PASTA', quantity: 1, unitPrice: 18, total: 18 },
    ] as TicketItem[];
    const fakeOrder = {
      id: 'PREVIEW01',
      ticketNumber: 'OR-PREVIEW',
      tableNumber: 'A1',
      serverName: 'INES',
      createdAt: Date.now(),
    };
    renderedHtml = buildModelReceiptHtml(
      'Aperçu',
      settings,
      fakeOrder,
      fakeTicket,
      fakeItems,
      'CASH',
      27,
    );
  } else {
    const isBar = kind === 'bar';
    const fakeOrder = {
      id: 'TEST001',
      ticketNumber: 'TEST01',
      type: 'TEST',
      tableNumber: 'A1',
      serverName: 'TEST',
      createdAt: Date.now(),
    };
    const fakeItems: PrintItem[] = isBar
      ? [
          {
            name: 'Mojito',
            quantity: 1,
            notes: productionTpl?.showItemNotes !== false ? 'TEST' : undefined,
          },
        ]
      : [
          {
            name: 'Pizza Margherita',
            quantity: 1,
            notes: productionTpl?.showItemNotes !== false ? 'TEST' : undefined,
          },
        ];
    renderedHtml = wrapHtmlForPrint(
      'Aperçu',
      buildProductionHtmlBody(isBar, productionTpl, fakeOrder, fakeItems),
    );
  }
  if (format === 'html') {
    return {
      fileName: `${kind}-template-preview.html`,
      contentType: 'text/html; charset=utf-8',
      buffer: Buffer.from(renderedHtml, 'utf8'),
    };
  }
  const pdf = await renderHtmlPdfBuffer(renderedHtml, 'COMPACT');
  return {
    fileName: `${kind}-template-preview.pdf`,
    contentType: 'application/pdf',
    buffer: pdf,
  };
}
