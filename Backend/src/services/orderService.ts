import { AppDataSource } from '../data-source.js';
import { Order } from '../entity/Order.js';
import { Session } from '../entity/Session.js';
import { OrderItem } from '../entity/OrderItem.js';
import { updateFundSales } from './fundSessionService.js';
import { emitEvent } from '../realtime.js';
import { printOrderItemsByPrinter, printPaymentReceipt, saveCategorizedPdf } from './printerService.js';
import { getSettings } from './settingsService.js';
import { deductIngredientsForOrder } from './recipeService.js';
import { generateNextPrefixedCode } from './prefixService.js';
import { Ticket } from '../entity/Ticket.js';
import { TicketItem } from '../entity/TicketItem.js';
import { Payment } from '../entity/Payment.js';
import { PaymentItem } from '../entity/PaymentItem.js';
import { RestaurantVoucher } from '../entity/RestaurantVoucher.js';
import { RestaurantCard } from '../entity/RestaurantCard.js';
import { RestaurantCardMovement } from '../entity/RestaurantCardMovement.js';
import { User } from '../entity/User.js';
import { Table } from '../entity/Table.js';
import { assertOrderQuota } from './saasLicenseService.js';

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

const normalizePaymentMethod = (value: any) =>
  String(value || 'CASH').trim().toUpperCase();
const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuidLike = (value: any) => UUID_LIKE_RE.test(String(value || '').trim());

/** Libère la table après paiement complet (tolère zoneId absent ou numéro avec espaces). */
async function freeTableForCompletedOrder(saved: any) {
  const rawNum = saved?.tableNumber;
  if (rawNum === undefined || rawNum === null || String(rawNum).trim() === '') return;
  const num = String(rawNum).trim();
  try {
    const tableRepo = AppDataSource.getRepository(Table);
    let table: Table | null = null;
    const zid = saved?.zoneId != null ? String(saved.zoneId).trim() : '';
    if (zid) {
      table = await tableRepo.findOne({ where: { number: num, zoneId: zid } as any });
    }
    if (!table) {
      table = await tableRepo.findOne({ where: { number: num } as any });
    }
    if (!table) return;
    table.status = 'AVAILABLE';
    table.token = undefined;
    table.reservedBy = null;
    table.reservedAt = null;
    table.reservedUntil = null;
    await tableRepo.save(table as any);
  } catch {
    /* ne pas bloquer le paiement */
  }
}

const normText = (value: any) => String(value ?? '').trim();
const buildOrderPdfText = (title: string, order: any, lines?: Array<{ name?: string; quantity?: number; notes?: string }>) => {
  const out: string[] = [];
  out.push(title);
  out.push(`Commande: ${String(order?.ticketNumber || order?.id || '-')}`);
  out.push(`Date: ${new Date().toLocaleString()}`);
  out.push(`Type: ${String(order?.type || '-')}`);
  out.push(`Table: ${String(order?.tableNumber || '-')}`);
  out.push(`Serveur: ${String(order?.serverName || '-')}`);
  out.push('------------------------------');
  const src = Array.isArray(lines) && lines.length > 0 ? lines : Array.isArray(order?.items) ? order.items : [];
  for (const row of src) {
    out.push(`- ${String(row?.name || 'Article')} x${Number(row?.quantity || 0)}`);
    if (normText((row as any)?.notes)) out.push(`  Note: ${normText((row as any)?.notes)}`);
  }
  out.push('');
  return out.join('\n');
};

async function callExternalRestaurantCardDebit(input: {
  url: string;
  token?: string;
  timeoutMs?: number;
  cardCode: string;
  amount: number;
  orderId: string;
  paymentCode: string;
}) {
  const timeoutMs = Number(input.timeoutMs || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
      },
      body: JSON.stringify({
        cardCode: input.cardCode,
        amount: input.amount,
        orderId: input.orderId,
        paymentCode: input.paymentCode,
      }),
      signal: controller.signal,
    });
    let payload: any = null;
    try {
      payload = await resp.json();
    } catch {}
    if (!resp.ok) {
      throw new Error(
        String(payload?.error || payload?.message || `External API error (${resp.status})`),
      );
    }
    if (!(payload?.ok === true || payload?.status === 'OK')) {
      throw new Error(String(payload?.error || payload?.message || 'External API rejected'));
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function generateNextTicketNumber(manager: any) {
  // Orders use the 'order' prefix (distinct from ticket prefix used for split tickets)
  return generateNextPrefixedCode(manager, 'order', { pad: 6 });
}

async function resolveSalesWarehouseId(
  manager: any,
  payload: { serverId?: string | null; warehouseId?: string | null },
) {
  const explicit = String(payload?.warehouseId || '').trim();
  if (explicit) return explicit;
  const serverId = String(payload?.serverId || '').trim();
  if (!serverId) return null;
  const userRepo = manager.getRepository(User);
  const user = await userRepo.findOneBy({ id: serverId } as any);
  const salesWarehouseId = String((user as any)?.salesWarehouseId || '').trim();
  if (salesWarehouseId) return salesWarehouseId;
  const assigned = Array.isArray((user as any)?.assignedWarehouseIds)
    ? (user as any).assignedWarehouseIds
    : [];
  const firstAssigned = String(assigned[0] || '').trim();
  return firstAssigned || null;
}

/** Commande avec lignes (pour API, WebSocket, caisse). */
export async function loadOrderWithItems(id: string) {
  const repo = AppDataSource.getRepository(Order);
  const itemRepo = AppDataSource.getRepository(OrderItem);
  const order = await repo.findOne({ where: { id } as any });
  if (!order) return null;
  const items = await itemRepo.find({ where: { order: { id } } as any });
  (order as any).items = items;
  return order;
}

export async function getOrders(params?: { terminalId?: string | null }) {
  const repo = AppDataSource.getRepository(Order);
  const settings = await getSettings();
  const terminalId =
    params?.terminalId !== undefined
      ? params.terminalId
        ? String(params.terminalId)
        : null
      : settings?.terminalId
        ? String(settings.terminalId)
        : null;
  const base: any = {
    relations: ['items'],
    order: { createdAt: 'DESC' },
  };
  if (terminalId) {
    base.where = { terminalId };
  }
  return repo.find(base);
}

export async function createOrder(body: any) {
  if (body && body.id) delete body.id;
  const shouldPrint = Boolean(body?.print);
  if (body && 'print' in body) delete body.print;
  const settings = await getSettings();
  const terminalId = (body?.terminalId ?? settings?.terminalId ?? null) as any;

  const saved = await AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Order);
    const { items: _incomingItems, ...rest } = body || {};

    // Reuse existing open order for same context to avoid duplicates
    let createdOrder = await repo.findOne({
      where: {
        status: 'PENDING',
        terminalId: terminalId || null,
        tableNumber: rest?.tableNumber || null,
        zoneId: rest?.zoneId || null,
        type: rest?.type || null,
        serverId: rest?.serverId || null,
      } as any,
    });

    if (!createdOrder) {
      await assertOrderQuota();
      const ticketNumber = await generateNextTicketNumber(manager);
      const newOrder = repo.create({
        ...rest,
        terminalId: terminalId || null,
        ticketNumber,
        createdAt: Date.now(),
        status: body?.status || 'PENDING',
        total: parseNumeric(body?.total),
        discount: parseNumeric(body?.discount),
        timbre: parseNumeric(body?.timbre),
        tableNumber: body?.tableNumber || null,
        zoneId: body?.zoneId || null,
        type: body?.type || null,
        serverName: body?.serverName || null,
        serverId: body?.serverId || null,
        shiftId: body?.shiftId || null,
        paidAmount: parseNumeric(body?.paidAmount),
        payments: body?.payments || [],
        clientDisplayName: normText(body?.clientDisplayName) || null,
      } as any);
      createdOrder = await repo.save(newOrder as any);
    } else if (body && 'clientDisplayName' in body) {
      (createdOrder as any).clientDisplayName = normText(body?.clientDisplayName) || null;
      createdOrder = await repo.save(createdOrder as any);
    }

    const itemsRepo = manager.getRepository(OrderItem);
    const orderItems = Array.isArray(_incomingItems) ? _incomingItems : [];
    for (const raw of orderItems as any[]) {
      const row = itemsRepo.create({
        order: createdOrder as any,
        productId: String(raw.productId || ''),
        name: String(raw.name || ''),
        notes: normText(raw.notes) || null,
        unitPrice: Number(
          raw.unitPrice !== undefined ? raw.unitPrice : raw.price || 0,
        ),
        quantity: Number(raw.quantity || 0),
        paidQuantity: Number(raw.paidQuantity || 0),
        remainingQuantity: Math.max(
          0,
          Number(raw.quantity || 0) - Number(raw.paidQuantity || 0),
        ),
        isLocked: Boolean(raw.isLocked || false),
        status: String(raw.status || 'UNPAID') as any,
        prepStatus: String(raw.prepStatus || 'PENDING'),
        station: raw.station != null && raw.station !== '' ? String(raw.station) : null,
      } as any);
      await itemsRepo.save(row as any);
    }

    const withItems = await repo.findOneBy({ id: (createdOrder as any).id } as any);
    (withItems as any).items =
      await itemsRepo.find({ where: { order: { id: (createdOrder as any).id } } as any });
    if (settings.preventSaleOnInsufficientStock !== false) {
      const salesWarehouseId = await resolveSalesWarehouseId(manager, {
        serverId: (createdOrder as any).serverId || null,
        warehouseId: null,
      });
      await deductIngredientsForOrder(
        {
          orderId: (createdOrder as any).id,
          ticketNumber: (createdOrder as any).ticketNumber || '',
          orderItems: (withItems as any).items || [],
          userName: (createdOrder as any).serverName || null,
          warehouseId: salesWarehouseId,
          preventNegativeStock: true,
          dryRun: true,
        },
        manager,
      );
    }
    return withItems!;
  });

  emitEvent('orders:created', saved);
  if (shouldPrint) {
    try {
      await saveCategorizedPdf({
        categoryPath: ['commandes_validees'],
        prefix: `commande-validee-${String((saved as any)?.ticketNumber || (saved as any)?.id || 'order')}`,
        text: buildOrderPdfText('COMMANDE VALIDEE', saved),
        fixedFileName: String((saved as any)?.ticketNumber || (saved as any)?.id || `order-${Date.now()}`),
        ticketTemplate: (settings as any)?.clientTicketTemplate,
      });
    } catch {}
  }
  if (shouldPrint) {
    try { await printOrderItemsByPrinter(saved); } catch {}
  }
  return saved;
}

export async function updateOrder(id: string, update: any) {
  const repo = AppDataSource.getRepository(Order);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  if (existing.invoiceId || String(existing.status || '').toUpperCase() === 'INVOICED') {
    throw new Error('Invoiced ticket cannot be modified');
  }
  const shouldPrint = Boolean(update?.print);
  const settings = await getSettings();
  const previousStatus = String((existing as any)?.status || '').toUpperCase();
  if (update && 'print' in update) delete update.print;
  const incomingItems = Array.isArray(update?.items) ? update.items : undefined;
  if (update && 'items' in update) delete update.items;
  if (update) {
    if ('total' in update) update.total = parseNumeric(update.total);
    if ('discount' in update) update.discount = parseNumeric(update.discount);
    if ('timbre' in update) update.timbre = parseNumeric(update.timbre);
    if ('paidAmount' in update) update.paidAmount = parseNumeric(update.paidAmount);
    if ('clientDisplayName' in update) {
      (update as any).clientDisplayName = normText((update as any).clientDisplayName) || null;
    }
  }
  Object.assign(existing, update);
  if (
    Array.isArray(incomingItems) &&
    settings.preventSaleOnInsufficientStock !== false
  ) {
    const salesWarehouseId = await resolveSalesWarehouseId(AppDataSource.manager, {
      serverId: (existing as any).serverId || null,
      warehouseId: null,
    });
    await deductIngredientsForOrder(
      {
        orderId: id,
        ticketNumber: (existing as any).ticketNumber || '',
        orderItems: incomingItems,
        userName: (existing as any).serverName || null,
        warehouseId: salesWarehouseId,
        preventNegativeStock: true,
        dryRun: true,
      },
      AppDataSource.manager,
    );
  }

  // Upsert order items if provided
  const kitchenPrintDelta: Array<{ productId?: string; name?: string; quantity?: number; notes?: string }> = [];
  const cancelledItemDelta: Array<{ productId?: string; name?: string; quantity?: number; notes?: string }> = [];
  if (Array.isArray(incomingItems)) {
    const itemsRepo = AppDataSource.getRepository(OrderItem);
    const current = await itemsRepo.find({ where: { order: { id } } as any });
    const byId = new Map(current.map((i: any) => [String(i.id), i]));
    const incomingIds = new Set(
      incomingItems
        .map((i: any) => String(i.id || ''))
        .filter((s: string) => !!s),
    );

    for (const raw of incomingItems as any[]) {
      const rowId = String(raw.id || '');
      const found = rowId ? byId.get(rowId) : null;
      if (found) {
        const oldQty = Number(found.quantity || 0);
        const oldNotes = normText((found as any).notes);
        const newQty = Number(raw.quantity ?? found.quantity ?? 0);
        const newNotes = normText(raw.notes);
        found.productId = String(raw.productId || found.productId || '');
        found.name = String(raw.name || found.name || '');
        found.unitPrice = Number(
          raw.unitPrice !== undefined ? raw.unitPrice : raw.price || found.unitPrice || 0,
        );
        found.quantity = newQty;
        const paid = Number(raw.paidQuantity ?? found.paidQuantity ?? 0);
        found.paidQuantity = paid;
        found.remainingQuantity = Math.max(0, Number(found.quantity || 0) - paid);
        found.isLocked = Boolean(raw.isLocked ?? found.isLocked ?? false);
        found.status = String(raw.status || found.status || 'UNPAID') as any;
        if (raw.prepStatus !== undefined && raw.prepStatus !== null) {
          (found as any).prepStatus = String(raw.prepStatus);
        }
        if (raw.station !== undefined) {
          (found as any).station =
            raw.station != null && raw.station !== '' ? String(raw.station) : null;
        }
        (found as any).notes = newNotes || null;
        await itemsRepo.save(found as any);
        if (newQty > oldQty) {
          kitchenPrintDelta.push({
            productId: String((raw as any).productId || found.productId || ''),
            name: String((raw as any).name || found.name || 'Article'),
            quantity: newQty - oldQty,
            notes: newNotes || undefined,
          });
        } else if (newQty < oldQty) {
          const delta = {
            productId: String((raw as any).productId || found.productId || ''),
            name: `ANNULATION ${String((raw as any).name || found.name || 'Article')}`,
            quantity: oldQty - newQty,
            notes: oldNotes || undefined,
          };
          kitchenPrintDelta.push(delta);
          cancelledItemDelta.push(delta);
        } else if (newNotes !== oldNotes && newNotes) {
          kitchenPrintDelta.push({
            productId: String((raw as any).productId || found.productId || ''),
            name: `MAJ INSTRUCTION ${String((raw as any).name || found.name || 'Article')}`,
            quantity: newQty > 0 ? newQty : 1,
            notes: newNotes,
          });
        }
      } else {
        const created = itemsRepo.create({
          order: existing as any,
          productId: String(raw.productId || ''),
          name: String(raw.name || ''),
          notes: normText(raw.notes) || null,
          unitPrice: Number(
            raw.unitPrice !== undefined ? raw.unitPrice : raw.price || 0,
          ),
          quantity: Number(raw.quantity || 0),
          paidQuantity: Number(raw.paidQuantity || 0),
          remainingQuantity: Math.max(
            0,
            Number(raw.quantity || 0) - Number(raw.paidQuantity || 0),
          ),
          isLocked: Boolean(raw.isLocked || false),
          status: String(raw.status || 'UNPAID') as any,
          prepStatus: String(raw.prepStatus || 'PENDING'),
          station: raw.station != null && raw.station !== '' ? String(raw.station) : null,
        } as any);
        await itemsRepo.save(created as any);
        kitchenPrintDelta.push({
          productId: String(raw.productId || ''),
          name: String(raw.name || 'Article'),
          quantity: Number(raw.quantity || 0),
          notes: normText(raw.notes) || undefined,
        });
      }
    }

    // Delete removed items
    const toDelete = current.filter(
      (i: any) => !incomingIds.has(String(i.id)),
    );
    if (toDelete.length > 0) {
      for (const removed of toDelete) {
        const delta = {
          productId: String((removed as any).productId || ''),
          name: `ANNULATION ${String((removed as any).name || 'Article')}`,
          quantity: Number((removed as any).quantity || 0),
          notes: normText((removed as any).notes) || undefined,
        };
        kitchenPrintDelta.push(delta);
        cancelledItemDelta.push(delta);
      }
      await itemsRepo.remove(toDelete as any);
    }

  }

  await repo.save(existing as any);
  const full = await loadOrderWithItems(id);
  emitEvent('orders:updated', full);
  const nextStatus = String((full as any)?.status || (existing as any)?.status || '').toUpperCase();
  if (kitchenPrintDelta.length > 0) {
    emitEvent('orders:kds-alert', {
      orderId: id,
      at: Date.now(),
      reason: 'ORDER_UPDATED',
    });
  }
  if (cancelledItemDelta.length > 0) {
    try {
      await saveCategorizedPdf({
        categoryPath: ['articles_annules'],
        prefix: `articles-annules-${String((full as any)?.ticketNumber || id)}`,
        text: buildOrderPdfText('ARTICLES ANNULES', full, cancelledItemDelta),
        fixedFileName: `${String((full as any)?.ticketNumber || id)}-articles-annules-${Date.now()}`,
        ticketTemplate: (settings as any)?.clientTicketTemplate,
      });
    } catch {}
  }
  if (nextStatus === 'CANCELLED' && previousStatus !== 'CANCELLED') {
    try {
      await saveCategorizedPdf({
        categoryPath: ['commandes_annulees'],
        prefix: `commande-annulee-${String((full as any)?.ticketNumber || id)}`,
        text: buildOrderPdfText('COMMANDE ANNULEE', full),
        fixedFileName: `${String((full as any)?.ticketNumber || id)}-annulee`,
        ticketTemplate: (settings as any)?.clientTicketTemplate,
      });
    } catch {}
  }
  if (shouldPrint && nextStatus !== 'CANCELLED') {
    try {
      await saveCategorizedPdf({
        categoryPath: ['commandes_validees'],
        prefix: `commande-validee-${String((full as any)?.ticketNumber || id)}`,
        text: buildOrderPdfText('COMMANDE VALIDEE', full),
        fixedFileName: `${String((full as any)?.ticketNumber || id)}-maj-${Date.now()}`,
        ticketTemplate: (settings as any)?.clientTicketTemplate,
      });
    } catch {}
  }
  if (shouldPrint && full) {
    try {
      if (kitchenPrintDelta.length > 0) {
        await printOrderItemsByPrinter(
          { ...full, items: kitchenPrintDelta } as any,
          { titleOverride: 'MISE A JOUR COMMANDE' },
        );
      } else {
        await printOrderItemsByPrinter(full);
      }
    } catch {}
  }
  return full;
}

export async function addOrderPayment(
  id: string,
  payment: { method: string; amount: number; createdAt?: number },
  opts?: { skipTicket?: boolean },
) {
  const repo = AppDataSource.getRepository(Order);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  if (existing.invoiceId || String(existing.status || '').toUpperCase() === 'INVOICED') {
    throw new Error('Invoiced ticket cannot be modified');
  }

  const amount = parseNumeric((payment as any).amount);
  if (!Number.isFinite(amount) || amount <= 0) return existing;
  const method = normalizePaymentMethod((payment as any).method);
  const reference = (payment as any).reference ? String((payment as any).reference).trim() : null;
  const metadata = ((payment as any).metadata || {}) as Record<string, any>;
  const settings = (await getSettings()) as any;
  const currentPaid = parseNumeric(existing.paidAmount);
  const total = parseNumeric(existing.total);
  const willBeCompleted = currentPaid + amount >= total;

  // Persist Payment entity and optional PaymentItem rows
  const manager = AppDataSource.manager;
  const payRepo = manager.getRepository(Payment);
  const payItemRepo = manager.getRepository(PaymentItem);
  const oiRepo = manager.getRepository(OrderItem);
  const voucherRepo = manager.getRepository(RestaurantVoucher);
  const cardRepo = manager.getRepository(RestaurantCard);
  const cardMvRepo = manager.getRepository(RestaurantCardMovement);
  let voucherToUse: RestaurantVoucher | null = null;
  let cardToUse: RestaurantCard | null = null;

  if (method === 'RESTAURANT_TICKET') {
    const voucherCode = String(metadata?.voucherCode || reference || '').trim();
    if (!voucherCode) throw new Error('Voucher code is required');
    const voucher = await voucherRepo.findOne({ where: { code: voucherCode } as any });
    if (!voucher) {
      // External/manual voucher: accepted by scanned code + entered amount.
      (metadata as any).voucherSource = 'EXTERNAL_MANUAL';
      (metadata as any).voucherCode = voucherCode;
    } else {
      if (String(voucher.status || '').toUpperCase() !== 'ACTIVE') {
        throw new Error('Restaurant voucher already used/cancelled');
      }
      const remaining = parseNumeric((voucher as any).remainingAmount);
      if (remaining < amount) throw new Error('Voucher amount is insufficient');
      voucherToUse = voucher as any;
      (metadata as any).voucherSource = 'LOCAL';
    }
  }
  if (method === 'RESTAURANT_CARD') {
    const cardCode = String(metadata?.cardCode || reference || '').trim();
    if (!cardCode) throw new Error('Restaurant card code is required');
    const card = await cardRepo.findOne({ where: { code: cardCode } as any });
    if (!card) {
      const ext = (settings?.externalRestaurantCardApi || {}) as any;
      if (!ext?.enabled || !String(ext?.url || '').trim()) {
        throw new Error('Restaurant card not found (no external API configured)');
      }
      (metadata as any).cardSource = 'EXTERNAL_API';
      (metadata as any).cardCode = cardCode;
    } else {
      if (!(card as any).active) throw new Error('Restaurant card is inactive');
      const balance = parseNumeric((card as any).balance);
      if (balance < amount) throw new Error('Insufficient restaurant card balance');
      cardToUse = card as any;
      (metadata as any).cardSource = 'LOCAL';
    }
  }
  if (willBeCompleted && !(existing as any).stockDeductedAt) {
    const orderItems = await oiRepo.find({ where: { order: { id } } as any });
    const salesWarehouseId = await resolveSalesWarehouseId(manager, {
      serverId: (existing as any).serverId || null,
      warehouseId: (payment as any)?.warehouseId || null,
    });
    await deductIngredientsForOrder({
      orderId: (existing as any).id,
      ticketNumber: (existing as any).ticketNumber || '',
      orderItems: orderItems || [],
      userName: (existing as any).serverName || null,
      warehouseId: salesWarehouseId,
      preventNegativeStock: settings.preventSaleOnInsufficientStock !== false,
    }, manager);
    (existing as any).stockDeductedAt = Date.now();
  }
  const createdAt = Number((payment as any).createdAt) || Date.now();
  const countForOrder = await payRepo.count({ where: { order: { id } } as any });
  const code =
    (existing.ticketNumber ? `${existing.ticketNumber}-P${countForOrder + 1}` : undefined) ||
    `${await generateNextPrefixedCode(manager, 'ticket', { pad: 6 })}-P${countForOrder + 1}`;
  const payRow = payRepo.create({
    code,
    order: existing as any,
    totalPaid: amount,
    paymentMethod: method,
    reference,
    metadata,
    createdAt,
  } as any);
  const savedPayment = await payRepo.save(payRow as any);

  // Consume restaurant instruments when used.
  if (method === 'RESTAURANT_TICKET' && voucherToUse) {
    const remaining = parseNumeric((voucherToUse as any).remainingAmount);
    (voucherToUse as any).remainingAmount = Math.max(0, remaining - amount);
    (voucherToUse as any).status =
      (voucherToUse as any).remainingAmount <= 0 ? 'USED' : 'ACTIVE';
    if ((voucherToUse as any).status === 'USED') {
      (voucherToUse as any).usedAt = Date.now();
    }
    await voucherRepo.save(voucherToUse as any);
  }

  if (method === 'RESTAURANT_CARD' && cardToUse) {
    const balance = parseNumeric((cardToUse as any).balance);
    (cardToUse as any).balance = Math.max(0, balance - amount);
    await cardRepo.save(cardToUse as any);
    const mv = cardMvRepo.create({
      card: cardToUse as any,
      payment: savedPayment as any,
      type: 'DEBIT',
      amount,
      reference: reference || String(savedPayment.code || ''),
      createdAt: Date.now(),
    } as any);
    await cardMvRepo.save(mv as any);
  }
  if (method === 'RESTAURANT_CARD' && !cardToUse) {
    const cardCode = String(metadata?.cardCode || reference || '').trim();
    const ext = (settings?.externalRestaurantCardApi || {}) as any;
    const extResp = await callExternalRestaurantCardDebit({
      url: String(ext?.url || '').trim(),
      token: String(ext?.token || '').trim(),
      timeoutMs: Number(ext?.timeoutMs || 8000),
      cardCode,
      amount,
      orderId: id,
      paymentCode: String(savedPayment.code || ''),
    });
    (savedPayment as any).metadata = {
      ...((savedPayment as any).metadata || {}),
      externalResponse: extResp,
    };
    await payRepo.save(savedPayment as any);
  }
  const reqItems = Array.isArray((payment as any).items) ? (payment as any).items : [];
  for (const req of reqItems) {
    const reqId = String(req?.id || '').trim();
    if (!isUuidLike(reqId)) continue;
    const ordItem = await oiRepo.findOneBy({ id: reqId } as any);
    if (!ordItem) continue;
    const qty = Number(req?.quantity || 0);
    const unitPrice = Number((ordItem as any).unitPrice || 0);
    const lineTotal = qty * unitPrice;
    const pi = payItemRepo.create({
      payment: savedPayment as any,
      orderItem: ordItem as any,
      quantityPaid: qty,
      unitPrice,
      total: lineTotal,
    } as any);
    await payItemRepo.save(pi as any);
    const alreadyPaid = Number((ordItem as any).paidQuantity || 0);
    (ordItem as any).paidQuantity = alreadyPaid + qty;
    (ordItem as any).remainingQuantity = Math.max(0, Number((ordItem as any).quantity || 0) - Number((ordItem as any).paidQuantity || 0));
    await oiRepo.save(ordItem as any);
  }
  existing.paidAmount = currentPaid + amount;
  if (existing.paidAmount >= total) {
    const finalCount = await payRepo.count({ where: { order: { id } } as any });
    existing.paymentMethod = finalCount === 1 ? method : 'SPLIT';
  } else {
    existing.paymentMethod = 'SPLIT';
  }

  await repo.save(existing as any);
  const fullAfterPay = await loadOrderWithItems(id);
  emitEvent('orders:payment', fullAfterPay || existing);

  await updateFundSales({
    shiftId: existing.shiftId || null,
    cashDelta: method === 'CASH' ? amount : 0,
    cardDelta: method === 'BANK_CARD' ? amount : 0,
    totalDelta: amount,
  });

  try {
    const sessionRepo = AppDataSource.getRepository(Session);
    const activeSession = await sessionRepo.findOne({ where: { isOpen: true } as any });
    if (activeSession) {
      activeSession.totalSales = parseNumeric(activeSession.totalSales) + amount;
      if (method === 'CASH') {
        activeSession.cashSales = parseNumeric(activeSession.cashSales) + amount;
      } else {
        activeSession.cardSales = parseNumeric(activeSession.cardSales) + amount;
      }
      activeSession.movements = [
        ...(Array.isArray((activeSession as any).movements) ? (activeSession as any).movements : []),
        { type: 'SALE', amount, at: Date.now(), by: existing.serverName || 'Unknown' } as any,
      ];
      await sessionRepo.save(activeSession as any);
    }
  } catch {}
  // Free table when order is fully paid
  let saved: any = fullAfterPay || existing;

  if (willBeCompleted) {
    await freeTableForCompletedOrder(saved);
  }


  if (!opts?.skipTicket) {
    // Create a ticket for this payment (supports partial payment items)
    try {
      const manager = AppDataSource.manager;
      const tRepo = manager.getRepository(Ticket);
      const oiRepo = manager.getRepository(OrderItem);
      const code = await generateNextPrefixedCode(manager, 'ticket', { pad: 6 });
      const createdTicket = tRepo.create({
        order: saved as any,
        payment: savedPayment as any,
        code,
        createdAt: Number((payment as any).createdAt) || Date.now(),
        total: amount,
        discount: 0,
        timbre: 0,
      } as any);
      const ticket = await tRepo.save(createdTicket as any);
      const items = Array.isArray((payment as any).items) ? (payment as any).items : [];
      for (const req of items) {
        const reqId = String(req?.id || '').trim();
        if (!isUuidLike(reqId)) continue;
        const ordItem = await oiRepo.findOneBy({ id: reqId } as any);
        if (!ordItem) continue;
        const ti = tRepo.manager.getRepository(TicketItem).create({
          ticket: ticket as any,
          orderItemId: ordItem.id as any,
          productId: ordItem.productId as any,
          name: ordItem.name as any,
          unitPrice: Number(ordItem.unitPrice || 0),
          quantity: Number(req?.quantity || 0),
          total: Number(req?.quantity || 0) * Number(ordItem.unitPrice || 0),
        } as any);
        await tRepo.manager.getRepository(TicketItem).save(ti as any);
      }
      // Client receipt printing is handled by frontend copy policy (printTicketCopies),
      // to avoid duplicate prints (backend 1x + frontend Nx).
      // attach tickets list for frontend
      (saved as any).tickets = await tRepo.find({ where: { order: { id } } as any, relations: ['items'] as any });
    } catch (err) {
      // ignore ticket creation errors to not block payment
    }
  }

  return saved;
}

export async function addOrderPaymentsBatch(
  id: string,
  payload: { lines?: Array<{ method: string; amount: number; createdAt?: number; items?: any[]; reference?: string; metadata?: Record<string, any> }> },
) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  if (lines.length === 0) {
    return await loadOrderWithItems(id);
  }
  let latest: any = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || ({} as any);
    const isLast = i === lines.length - 1;
    latest = await addOrderPayment(
      id,
      {
        method: String((line as any).method || ''),
        amount: Number((line as any).amount || 0),
        createdAt: Number((line as any).createdAt) || Date.now(),
        ...(line as any),
      } as any,
      { skipTicket: !isLast },
    );
  }
  return latest;
}
