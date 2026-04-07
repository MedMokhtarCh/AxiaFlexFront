import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { AppDataSource } from '../data-source.js';
import { Printer } from '../entity/Printer.js';
import { Product } from '../entity/Product.js';
import { Ticket } from '../entity/Ticket.js';
import { TicketItem } from '../entity/TicketItem.js';
import { OrderItem } from '../entity/OrderItem.js';
import { User } from '../entity/User.js';
import { getSettings } from './settingsService.js';

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
	if (process.platform !== 'win32') return [];
	try {
		const { stdout } = await execFileAsync('powershell', [
			'-NoProfile',
			'-ExecutionPolicy',
			'Bypass',
			'-Command',
			'Get-Printer | Select-Object Name,DriverName,PortName,Shared,ShareName | ConvertTo-Json -Compress',
		]);
		const text = (stdout || '').trim();
		if (!text) return [];
		const data = JSON.parse(text);
		return Array.isArray(data) ? data : [data];
	} catch {
		return [];
	}
}

type PrintItem = {
	productId?: string;
	name?: string;
	quantity?: number;
	notes?: string;
};

const formatLine = (item: PrintItem) => {
	const qty = Number(item.quantity || 0);
	const name = item.name || 'Article';
	const notes = item.notes ? ` (${item.notes})` : '';
	return `- ${name} x${qty}${notes}`;
};

const formatLineWithTemplate = (item: PrintItem, tpl: any) => {
	const qty = Number(item.quantity || 0);
	const name = item.name || 'Article';
	const qtyText = tpl?.showItemQty !== false ? ` x${qty}` : '';
	const notesText =
		tpl?.showItemNotes !== false && item.notes ? ` (${item.notes})` : '';
	return `- ${name}${qtyText}${notesText}`;
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
const normalizeTicketTemplate = (value: any) => {
  const raw = String(value || 'CLASSIC').trim().toUpperCase();
  if (raw === 'COMPACT' || raw === 'MODERN' || raw === 'CLASSIC') return raw;
  return 'CLASSIC';
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
	return saveTextAsPdf(opts.prefix, opts.text, {
		directory,
		fixedFileName: opts.fixedFileName,
    ticketTemplate: opts.ticketTemplate,
	});
}

const printText = async (printerName: string, text: string) => {
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

const buildReceiptText = (
  settings: any,
  order: any,
  ticket: Ticket,
  items: TicketItem[],
  paymentMethod?: string,
  amount?: number,
) => {
  const layout = (settings as any)?.clientTicketLayout || {};
  const show = (key: string, defaultValue = true) =>
    layout?.[key] !== undefined ? Boolean(layout[key]) : defaultValue;
  const headerText = String(layout?.headerText || '').trim();
  const footerText = String(layout?.footerText || '').trim();
  const currency = String((settings as any)?.currency || 'DT').trim();
  const lines: string[] = [];
  lines.push('==============================');
  lines.push((settings as any)?.restaurantName ? String((settings as any).restaurantName) : '');
  lines.push(headerText || '');
  lines.push(show('showTicketNumber', true) ? `Ticket ${ticket.code}` : '');
  lines.push(order?.ticketNumber ? `Commande ${order.ticketNumber}` : '');
  lines.push(show('showTable', true) && order?.tableNumber ? `Table: ${order.tableNumber}` : '');
  lines.push(show('showServer', true) && order?.serverName ? `Serveur: ${order.serverName}` : '');
  lines.push(show('showPaymentMethod', true) && paymentMethod ? `Paiement: ${paymentMethod}` : '');
  lines.push(show('showDate', true) ? new Date(ticket.createdAt || Date.now()).toLocaleString() : '');
  lines.push(show('showAddress', true) && (settings as any)?.address ? `Adresse: ${String((settings as any).address)}` : '');
  lines.push(show('showPhone', true) && (settings as any)?.phone ? `Tel: ${String((settings as any).phone)}` : '');
  lines.push(show('showTaxId', true) && (settings as any)?.taxId ? `MF: ${String((settings as any).taxId)}` : '');
  lines.push('------------------------------');
  let sum = 0;
  for (const it of items) {
    const qty = Number((it as any).quantity || 0);
    const price = Number((it as any).unitPrice || 0);
    const total = qty * price;
    sum += total;
    if (show('showItemUnitPrice', true)) {
      lines.push(`${(it as any).name} x${qty} @ ${price.toFixed(3)} = ${total.toFixed(3)}`);
    } else {
      lines.push(`${(it as any).name} x${qty} = ${total.toFixed(3)}`);
    }
  }
  lines.push('------------------------------');
  lines.push(show('showPriceHt', true) ? `Sous-total: ${sum.toFixed(3)} ${currency}` : '');
  lines.push(show('showTicketDiscount', true) && Number((ticket as any)?.discount || 0) > 0
    ? `Remise: -${Number((ticket as any)?.discount || 0).toFixed(3)} ${currency}`
    : '');
  lines.push(show('showTimbre', true) && Number((ticket as any)?.timbre || 0) > 0
    ? `Timbre: ${Number((ticket as any)?.timbre || 0).toFixed(3)} ${currency}`
    : '');
  lines.push(show('showPriceTtc', true) ? `Total TTC: ${Number((ticket as any)?.total || sum).toFixed(3)} ${currency}` : '');
  if (typeof amount === 'number') {
    lines.push(`Règlement: ${amount.toFixed(3)} ${currency} ${paymentMethod ? `(${paymentMethod})` : ''}`);
  }
  lines.push(footerText || '');
  lines.push('==============================\n');
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
  const tpl = normalizeTicketTemplate((settings as any)?.clientTicketTemplate);
  const layout = (settings as any)?.clientTicketLayout || {};
  const show = (key: string, defaultValue = true) =>
    layout?.[key] !== undefined ? Boolean(layout[key]) : defaultValue;
  const currency = String((settings as any)?.currency || 'DT').trim();
  const title = String((settings as any)?.restaurantName || 'Ticket client').trim();

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const compact = tpl === 'COMPACT';
  const modern = tpl === 'MODERN';

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
  if (show('showDate', true)) doc.text(`Date: ${new Date(ticket.createdAt || Date.now()).toLocaleString()}`);
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
  if (show('showTimbre', true) && Number((ticket as any)?.timbre || 0) > 0) {
    doc.text(`Timbre: ${Number((ticket as any).timbre || 0).toFixed(3)} ${currency}`);
  }
  if (show('showPriceTtc', true)) {
    doc.font(compact ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(compact ? 9 : 10).text(`TOTAL TTC: ${Number((ticket as any)?.total || subtotal).toFixed(3)} ${currency}`);
  }
  if (typeof amount === 'number') doc.font(compact ? 'Courier' : 'Helvetica').fontSize(compact ? 8 : 9).text(`Règlement: ${amount.toFixed(3)} ${currency}`);
  const footerText = String(layout?.footerText || '').trim();
  if (footerText) {
    doc.moveDown(0.6);
    doc.fillColor('#475569').font(compact ? 'Courier' : 'Helvetica-Oblique').fontSize(compact ? 7 : 8).text(footerText, { align: 'center' });
  }
};

export async function getTicketPdfBuffer(ticketId: string) {
  const settings = await getSettings();
  const tRepo = AppDataSource.getRepository(Ticket);
  const ticket = await tRepo.findOne({ where: { id: ticketId } as any });
  if (!ticket) throw new Error('Ticket not found');
  const orderRepo = AppDataSource.getRepository<any>('Order');
  const order = await orderRepo.findOne({ where: { id: (ticket as any).order?.id } as any });
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
	const items: PrintItem[] = Array.isArray(order?.items) ? order.items : [];
	if (!items.length) return;

	const productRepo = AppDataSource.getRepository(Product);
	const printerRepo = AppDataSource.getRepository(Printer);

	const productIds = Array.from(
		new Set(items.map((i) => i.productId).filter(Boolean) as string[]),
	);
	const products = await productRepo.findBy({ id: productIds as any });
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
		const printerIds = Array.isArray(product?.printerIds)
			? product?.printerIds
			: [];
		if (!printerIds.length) return;

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
    const orderRef = order?.id ? String(order.id).slice(-6) : 'N/A';
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
        ? `Heure: ${new Date(order?.createdAt || Date.now()).toLocaleString()}`
        : '',
      '------------------------------',
    ].filter(Boolean);
		const bodyLines = list.map((it) => formatLineWithTemplate(it, tpl));
    const footerLine = String(tpl?.footerText || '').trim();
		const text = [...headerLines, ...bodyLines, footerLine, '\n'].filter(Boolean).join('\n');
    try {
      const stationFolder = isBar ? 'bar' : 'cuisine';
      await saveCategorizedPdf({
        categoryPath: ['tickets_preparation', stationFolder],
        prefix: `${stationFolder}-${String(order?.ticketNumber || order?.id || 'commande')}`,
        text,
        fixedFileName: `${String(order?.ticketNumber || order?.id || 'commande')}-${stationFolder}-${Date.now()}`,
        ticketTemplate: (settings as any)?.clientTicketTemplate,
      });
    } catch {}
		await printText(printer.name, text);
		printed = true;
	}
	if (!printed) {
		const fallbackLines = [
			'BON PRODUCTION (PDF)',
			order?.id ? `Commande #${String(order.id).slice(-6)}` : '',
			`Type: ${order?.type || ''}`,
			order?.tableNumber ? `Table: ${order.tableNumber}` : '',
			order?.serverName ? `Serveur: ${order.serverName}` : '',
			`Heure: ${new Date(order?.createdAt || Date.now()).toLocaleString()}`,
			'------------------------------',
			...items.map((it) => formatLine(it)),
			'',
		].filter(Boolean).join('\n');
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

export async function printPaymentReceipt(order: any, ticket: Ticket, paymentMethod?: string, amount?: number) {
  const settings = await getSettings();
  const printerRepo = AppDataSource.getRepository(Printer);
  const tiRepo = AppDataSource.getRepository(TicketItem);
  const printers = await printerRepo.find();
  const receipt = printers.find((p) => String(p.type).toUpperCase() === 'RECEIPT');
  const items = await tiRepo.find({ where: { ticket: { id: ticket.id } } as any });
  const text = buildReceiptText(settings, order, ticket, items, paymentMethod, amount);
  const ticketCode = String(ticket.code || order?.ticketNumber || 'ticket');
  const methodFolder = sanitizeFileName(
    String(paymentMethod || 'UNKNOWN').toUpperCase(),
    'UNKNOWN',
  );
  const baseDir = resolveArchiveBaseDirectory(settings);
  const targetDir = path.join(baseDir, 'tickets_client', methodFolder);
  await fs.mkdir(targetDir, { recursive: true });
  const pdfPath = path.join(targetDir, `${sanitizeFileName(ticketCode, 'ticket')}.pdf`);
  const style = getPdfTemplateStyle((settings as any)?.clientTicketTemplate);
  await new Promise<void>((resolve, reject) => {
    const doc = new (PDFDocument as any)({ size: style.size, margin: style.margin });
    const stream = createWriteStream(pdfPath);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    (doc as any).on('error', reject);
    (doc as any).pipe(stream);
    renderReceiptPdfDocument(doc, settings, order, ticket, items, paymentMethod, amount);
    (doc as any).end();
  });
  const savedPdf = pdfPath;
  console.info(`[print] Reçu PDF sauvegardé: ${savedPdf}`);
  const assignedName = await resolvePhysicalPrinterNameForOrderServer(order);
  const printTarget = assignedName || receipt?.name;
  if (!printTarget) {
    console.warn(
      `[print] Aucune imprimante : ni affectation serveur, ni imprimante caisse globale. PDF: ${savedPdf}`,
    );
    return;
  }
  await printText(printTarget, text);
}

export async function printTicket(ticketId: string) {
  const tRepo = AppDataSource.getRepository(Ticket);
  const ticket = await tRepo.findOne({ where: { id: ticketId } as any });
  if (!ticket) return;
  const orderRepo = AppDataSource.getRepository<any>('Order');
  const order = await orderRepo.findOne({ where: { id: (ticket as any).order?.id } as any });
  await printPaymentReceipt(order, ticket);
}

/**
 * Ticket client sans ligne Ticket en base (commande en cours / pas encore d'encaissement).
 * Même rendu PDF + impression que le ticket définitif (paramètres clientTicketTemplate / Layout).
 */
export async function printProvisionalClientReceipt(orderId: string) {
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
  const assignedName = await resolvePhysicalPrinterNameForOrderServer(order);
  const printTarget = assignedName || receipt?.name;
  if (!printTarget) {
    console.warn(
      `[print] Aucune imprimante : ni affectation serveur, ni imprimante caisse globale. PDF: ${pdfPath}`,
    );
    return;
  }
  await printText(printTarget, text);
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
  await printText(target.name, lines.join('\n'));
  return {
    ok: true,
    printer: target.name,
    printerId: target.id,
    profile: isBar ? 'bar' : 'kitchen',
  };
}
