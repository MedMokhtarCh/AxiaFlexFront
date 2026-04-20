import { AppDataSource } from '../data-source.js';
import { Order } from '../entity/Order.js';
import { OrderItem } from '../entity/OrderItem.js';
import { Ticket } from '../entity/Ticket.js';
import { TicketItem } from '../entity/TicketItem.js';
import { generateNextPrefixedCode } from './prefixService.js';
import { getSettings } from './settingsService.js';

type CheckoutItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type CheckoutPayload = {
  terminalId: string;
  cashierId?: string;
  cashierName?: string;
  paymentMethod?: string;
  total: number;
  discount?: number;
  timbre?: number;
  items: CheckoutItem[];
};

const SIC_BASE_URL = (
  (process.env as Record<string, string | undefined>)['SIC_BASE_URL'] ||
  'http://127.0.0.1:10006/sic/external'
).replace(/\/+$/, '');

function toFixed3(value: number) {
  return Number((Number(value || 0)).toFixed(3));
}

async function callSic(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  imdf?: string,
) {
  const resolvedImdf = String(imdf || '').trim().toUpperCase();
  const headers: Record<string, string> = {
    ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    ...(resolvedImdf ? { 'x-nacef-imdf': resolvedImdf } : {}),
  };
  const response = await fetch(`${SIC_BASE_URL}${path}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(json?.error || json?.message || `SIC HTTP ${response.status}`);
  }
  return json;
}

async function resolveImdfForFiscalFlow() {
  const settings = await getSettings().catch(() => ({} as any));
  const envImdf = String((process.env as Record<string, string | undefined>)['NACEF_IMDF'] || '')
    .trim()
    .toUpperCase();
  const settingsImdf = String((settings as any)?.nacefImdf || '')
    .trim()
    .toUpperCase();
  return settingsImdf || envImdf || 'DEFAULT_IMDF';
}

export async function getCurrentImdf() {
  const settings = await getSettings().catch(() => ({} as any));
  const envImdf = String((process.env as Record<string, string | undefined>)['NACEF_IMDF'] || '')
    .trim()
    .toUpperCase();
  const settingsImdf = String((settings as any)?.nacefImdf || '')
    .trim()
    .toUpperCase();
  const resolvedImdf = settingsImdf || envImdf || 'DEFAULT_IMDF';
  return {
    resolvedImdf,
    source: settingsImdf ? 'settings.nacefImdf' : envImdf ? 'env.NACEF_IMDF' : 'default',
    settingsImdf: settingsImdf || null,
    envImdf: envImdf || null,
    sicBaseUrl: SIC_BASE_URL,
  };
}

function buildFiscalTicketPayload(payload: CheckoutPayload, orderId: string, ticketCode: string) {
  const totalHt = Math.max(0, toFixed3(payload.total - (payload.timbre ?? 0)));
  const taxTotal = Math.max(0, toFixed3(payload.total - totalHt));
  return {
    id: ticketCode,
    orderId,
    operationType: 'SALE',
    transactionType: 'NORMAL',
    totalHt: totalHt.toFixed(3),
    taxTotal: taxTotal.toFixed(3),
    totalTtc: toFixed3(payload.total).toFixed(3),
    currency: 'TND',
    issuedAt: Date.now(),
    fiscalLines: payload.items.map((item) => ({
      name: String(item.name || ''),
      quantity: toFixed3(item.quantity).toFixed(3),
      unitPriceHt: toFixed3(item.unitPrice).toFixed(3),
      lineHt: toFixed3(item.lineTotal).toFixed(3),
      lineTax: '0.000',
      lineTtc: toFixed3(item.lineTotal).toFixed(3),
      taxRate: '0.000',
    })),
    taxBreakdown: [
      {
        taxRate: '0.000',
        taxableBase: totalHt.toFixed(3),
        taxAmount: taxTotal.toFixed(3),
      },
    ],
  };
}

function toTransactionResponse(ticket: any) {
  return {
    ticketId: ticket.id,
    orderId: ticket?.order?.id || null,
    status: ticket.fiscalStatus === 'REJECTED' ? 'REJECTED' : ticket.fiscalStatus ? 'ACK' : 'PENDING_SYNC',
    payload: {
      ticketId: ticket.id,
      orderId: ticket?.order?.id || null,
      total: Number(ticket.total || 0),
      discount: Number(ticket.discount || 0),
      timbre: Number(ticket.timbre || 0),
      signature: ticket.fiscalSignature || null,
      qrPayload: ticket.fiscalQrPayload || null,
    },
    attempts: 1,
    lastError: ticket.fiscalErrorCode || null,
    createdAt: new Date(Number(ticket.createdAt || Date.now())).toISOString(),
    updatedAt: new Date(Number(ticket.createdAt || Date.now())).toISOString(),
  };
}

export async function getManifest() {
  const imdf = await resolveImdfForFiscalFlow();
  return callSic('/manifest', 'GET', undefined, imdf);
}

export async function checkout(payload: CheckoutPayload) {
  if (!payload?.terminalId) throw new Error('terminalId is required');
  if (!Array.isArray(payload?.items) || payload.items.length === 0) {
    throw new Error('At least one item is required');
  }

  const imdf = await resolveImdfForFiscalFlow();

  return AppDataSource.transaction(async (manager) => {
    const orderRepo = manager.getRepository(Order);
    const orderItemRepo = manager.getRepository(OrderItem);
    const ticketRepo = manager.getRepository(Ticket);
    const ticketItemRepo = manager.getRepository(TicketItem);

    const order: any = await orderRepo.save(
      orderRepo.create({
        terminalId: payload.terminalId,
        total: toFixed3(payload.total),
        discount: toFixed3(payload.discount || 0),
        timbre: toFixed3(payload.timbre || 0),
        serverId: payload.cashierId || null,
        serverName: payload.cashierName || null,
        type: 'TAKE_OUT',
        status: 'COMPLETED',
        paymentMethod: String(payload.paymentMethod || 'CASH').toUpperCase(),
        createdAt: Date.now(),
      } as any),
    );

    const createdOrderItems: any[] = [];
    for (const item of payload.items) {
      const oi = orderItemRepo.create({
        order,
        productId: String(item.productId || ''),
        name: String(item.name || ''),
        unitPrice: Number(item.unitPrice || 0),
        quantity: Number(item.quantity || 0),
        paidQuantity: Number(item.quantity || 0),
        remainingQuantity: 0,
        status: 'PAID',
        isLocked: true,
      } as any);
      const savedOi = await orderItemRepo.save(oi);
      createdOrderItems.push(savedOi);
    }

    const ticketCode = await generateNextPrefixedCode(manager, 'ticket', { pad: 6 });
    const ticket: any = await ticketRepo.save(
      ticketRepo.create({
        code: ticketCode,
        order,
        total: toFixed3(payload.total),
        discount: toFixed3(payload.discount || 0),
        timbre: toFixed3(payload.timbre || 0),
        createdAt: Date.now(),
      } as any),
    );

    for (let index = 0; index < payload.items.length; index += 1) {
      const item = payload.items[index];
      const orderItem = createdOrderItems[index];
      if (!orderItem?.id) {
        throw new Error('Failed to create order item for fiscal ticket');
      }
      await ticketItemRepo.save(
        ticketItemRepo.create({
          ticket,
          orderItemId: String(orderItem.id),
          productId: String(item.productId || ''),
          name: String(item.name || ''),
          unitPrice: Number(item.unitPrice || 0),
          quantity: Number(item.quantity || 0),
          total: Number(item.lineTotal || 0),
        } as any),
      );
    }

    try {
      const ticketPayload = buildFiscalTicketPayload(payload, order.id, ticket.code);
      const signatureResponse = await callSic('/sign/request/', 'POST', {
        imdf,
        cashRegisterInfo: {
          imdf,
        },
        base64Ticket: Buffer.from(JSON.stringify(ticketPayload), 'utf8').toString('base64'),
        totalHT: Number(ticketPayload.totalHt),
        totalTax: Number(ticketPayload.taxTotal),
        operationType: 'Vente',
        transactionType: 'Original',
      }, imdf);
      const syncResponse = await callSic(
        '/sync/request/',
        'POST',
        {
          requestPINupdate: false,
          imdf,
          cashRegisterInfo: {
            imdf,
          },
        },
        imdf,
      );
      ticket.fiscalStatus = 'SIGNED';
      ticket.fiscalMode = 'ONLINE';
      ticket.fiscalImdf = imdf;
      ticket.fiscalSignature = String(signatureResponse?.signedTicket?.signature || signatureResponse?.signature || '');
      ticket.fiscalQrPayload = String(
        signatureResponse?.signedTicket?.qrCodePayload || signatureResponse?.qrCodePayload || '',
      );
      ticket.fiscalPayloadJson = JSON.stringify({
        signatureResponse,
        syncResponse,
      });
      ticket.fiscalErrorCode = null;
    } catch (error: any) {
      ticket.fiscalStatus = 'REJECTED';
      ticket.fiscalMode = 'OFFLINE';
      ticket.fiscalErrorCode = String(error?.message || 'FISCAL_ERROR');
    }

    await ticketRepo.save(ticket);
    const reloaded = await ticketRepo.findOne({ where: { id: ticket.id } as any, relations: ['order'] as any });
    return toTransactionResponse(reloaded);
  });
}

export async function listTransactions() {
  const repo = AppDataSource.getRepository(Ticket);
  const rows = await repo.find({
    where: [{ fiscalStatus: 'SIGNED' } as any, { fiscalStatus: 'REJECTED' } as any],
    order: { createdAt: 'DESC' } as any,
    relations: ['order'] as any,
  });
  return rows.map(toTransactionResponse);
}

export async function getTransaction(ticketId: string) {
  const repo = AppDataSource.getRepository(Ticket);
  const row = await repo.findOne({ where: { id: ticketId } as any, relations: ['order'] as any });
  if (!row) return null;
  return toTransactionResponse(row);
}

export async function retrySync(ticketId: string) {
  const repo = AppDataSource.getRepository(Ticket);
  const row = await repo.findOne({ where: { id: ticketId } as any, relations: ['order'] as any });
  if (!row) return null;
  const imdf = await resolveImdfForFiscalFlow();
  try {
    const syncResponse = await callSic(
      '/sync/request/',
      'POST',
      {
        requestPINupdate: false,
        imdf,
        cashRegisterInfo: {
          imdf,
        },
      },
      imdf,
    );
    row.fiscalStatus = 'SIGNED';
    row.fiscalMode = 'ONLINE';
    row.fiscalImdf = imdf;
    row.fiscalErrorCode = null;
    row.fiscalPayloadJson = JSON.stringify({
      ...(row.fiscalPayloadJson ? { previous: row.fiscalPayloadJson } : {}),
      retrySync: syncResponse,
    });
  } catch (error: any) {
    row.fiscalStatus = 'REJECTED';
    row.fiscalMode = 'OFFLINE';
    row.fiscalErrorCode = String(error?.message || 'SYNC_FAILED');
  }
  await repo.save(row);
  return toTransactionResponse(row);
}

export async function getOrderFiscalStatus(orderId: string) {
  const repo = AppDataSource.getRepository(Ticket);
  const row = await repo.findOne({
    where: { order: { id: orderId } } as any,
    order: { createdAt: 'DESC' } as any,
    relations: ['order'] as any,
  });
  if (!row) return null;
  return toTransactionResponse(row);
}
