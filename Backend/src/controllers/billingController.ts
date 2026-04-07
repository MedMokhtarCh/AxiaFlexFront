import { Request, Response } from 'express';
import { In, Not } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';
import { Client } from '../entity/Client.js';
import { Invoice } from '../entity/Invoice.js';
import { Order } from '../entity/Order.js';
import { generateNextPrefixedCode } from '../services/prefixService.js';

const INVOICED_STATUS = 'INVOICED';

const toNumber = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const isOrderPaid = (order: any) => {
  const status = String(order?.status || '').toUpperCase();
  if (status === 'COMPLETED') return true;

  const total = toNumber(order?.total);
  if (total <= 0) return false;

  const paidAmount = toNumber(order?.paidAmount);
  if (paidAmount >= total) return true;

  const payments = Array.isArray(order?.payments) ? order.payments : [];
  const paymentsTotal = payments.reduce(
    (sum: number, payment: any) => sum + toNumber(payment?.amount),
    0,
  );
  return paymentsTotal >= total;
};

const hasOrderPayment = (order: any) => {
  const paidAmount = toNumber(order?.paidAmount);
  if (paidAmount > 0) return true;

  const payments = Array.isArray(order?.payments) ? order.payments : [];
  return payments.some((payment: any) => toNumber(payment?.amount) > 0);
};

const restoreOrderStatusAfterInvoiceDelete = (order: any) => {
  if (String(order?.status || '').toUpperCase() !== INVOICED_STATUS) return order?.status;
  if (isOrderPaid(order)) return 'COMPLETED';
  if (hasOrderPayment(order)) return 'PARTIAL';
  return 'PENDING';
};

const normalizeClientPayload = (payload: any) => ({
  type: String(payload?.type || 'PERSON').toUpperCase() === 'COMPANY' ? 'COMPANY' : 'PERSON',
  name: String(payload?.name || '').trim(),
  email: payload?.email ? String(payload.email).trim() : null,
  phone: payload?.phone ? String(payload.phone).trim() : null,
  address: payload?.address ? String(payload.address).trim() : null,
  cin: payload?.cin ? String(payload.cin).trim() : null,
  birthDate: payload?.birthDate ? String(payload.birthDate).trim() : null,
  taxId: payload?.taxId ? String(payload.taxId).trim() : null,
});

async function resolveClient(manager: any, payload: any) {
  const clientRepo = manager.getRepository(Client);
  const id = payload?.clientId ? String(payload.clientId).trim() : '';
  if (id) {
    const existing = await clientRepo.findOneBy({ id } as any);
    if (existing) return existing;
  }

  const normalized = normalizeClientPayload(payload?.client || payload?.clientData || payload || {});
  if (!normalized.name) return null;

  const entity = clientRepo.create({
    ...normalized,
    code: await generateNextPrefixedCode(manager, 'client', { pad: 6 }),
    createdAt: Date.now(),
  } as any);

  return clientRepo.save(entity as any);
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function listClients(_req: Request, res: Response) {
  try {
    const rows = await AppDataSource.getRepository(Client).find({ order: { createdAt: 'DESC' } as any });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function createClient(req: Request, res: Response) {
  try {
    const normalized = normalizeClientPayload(req.body || {});
    if (!normalized.name) return res.status(400).json({ error: 'Client name is required' });

    const saved = await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Client);
      return repo.save(
        repo.create({
          ...normalized,
          code: await generateNextPrefixedCode(manager, 'client', { pad: 6 }),
          createdAt: Date.now(),
        } as any) as any,
      );
    });
    void logAppAdminAction(req, 'insert', 'client', saved.id, { code: (saved as any).code });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function patchClient(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing client id' });

    const repo = AppDataSource.getRepository(Client);
    const existing = await repo.findOneBy({ id } as any);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    const normalized = normalizeClientPayload({ ...existing, ...(req.body || {}) });
    if (!normalized.name) return res.status(400).json({ error: 'Client name is required' });

    Object.assign(existing, normalized);
    const saved = await repo.save(existing as any);
    void logAppAdminAction(req, 'update', 'client', id);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function deleteClient(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing client id' });

    const repo = AppDataSource.getRepository(Client);
    const existing = await repo.findOneBy({ id } as any);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    const orderRepo = AppDataSource.getRepository(Order);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const usedInOrders = await orderRepo.count({ where: { clientId: id } as any });
    const usedInInvoices = await invoiceRepo.count({ where: { clientId: id } as any });
    if (usedInOrders > 0 || usedInInvoices > 0) {
      return res.status(409).json({ error: 'Client linked to orders/invoices and cannot be deleted' });
    }

    await repo.delete({ id } as any);
    void logAppAdminAction(req, 'delete', 'client', id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function listInvoices(_req: Request, res: Response) {
  try {
    const rows = await AppDataSource.getRepository(Invoice).find({ order: { createdAt: 'DESC' } as any });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function getInvoice(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing invoice id' });

    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const orderRepo = AppDataSource.getRepository(Order);
    const clientRepo = AppDataSource.getRepository(Client);

    const invoice = await invoiceRepo.findOneBy({ id } as any);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const orderIds = Array.isArray((invoice as any).orderIds) ? (invoice as any).orderIds : [];
    const orders = orderIds.length > 0 ? await orderRepo.findBy({ id: In(orderIds) } as any) : [];
    const client = await clientRepo.findOneBy({ id: (invoice as any).clientId } as any);

    res.json({ invoice, orders, client });
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function createInvoice(req: Request, res: Response) {
  try {
    const payload = req.body || {};
    const orderIds = uniqueIds(
      Array.isArray(payload.orderIds)
        ? payload.orderIds.map((id: any) => String(id || '').trim())
        : [],
    );
    if (orderIds.length === 0) {
      return res.status(400).json({ error: 'No tickets selected' });
    }

    const result = await AppDataSource.transaction(async (manager) => {
      const client = await resolveClient(manager, payload);
      if (!client) throw new Error('Client info required for invoice');

      const invoiceRepo = manager.getRepository(Invoice);
      const orderRepo = manager.getRepository(Order);

      const orders = await orderRepo.findBy({ id: In(orderIds) } as any);
      if (orders.length !== orderIds.length) throw new Error('Some selected tickets were not found');
      const blocked = (orders as any[]).find((order) => order.invoiceId);
      if (blocked) throw new Error('Some selected tickets are already invoiced');
      const unpaid = (orders as any[]).find((order) => !isOrderPaid(order));
      if (unpaid) throw new Error('Only paid tickets can be transformed into invoice');

      const total = (orders as any[]).reduce((sum, order) => sum + toNumber(order.total), 0);

      const invoice = await invoiceRepo.save(
        invoiceRepo.create({
          code: await generateNextPrefixedCode(manager, 'invoice', { pad: 6 }),
          clientId: client.id,
          orderIds,
          total,
          createdAt: Date.now(),
        } as any) as any,
      );

      for (const order of orders as any[]) {
        order.clientId = client.id;
        order.invoiceId = invoice.id;
        order.status = INVOICED_STATUS;
      }
      await orderRepo.save(orders as any);

      return { invoice, client, orders };
    });

    void logAppAdminAction(req, 'insert', 'invoice', result.invoice.id, {
      code: (result.invoice as any).code,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function patchInvoice(req: Request, res: Response) {
  try {
    const invoiceId = String(req.params.id || '').trim();
    if (!invoiceId) return res.status(400).json({ error: 'Missing invoice id' });

    const payload = req.body || {};
    const requestedOrderIds = uniqueIds(
      Array.isArray(payload.orderIds)
        ? payload.orderIds.map((id: any) => String(id || '').trim())
        : [],
    );

    const result = await AppDataSource.transaction(async (manager) => {
      const invoiceRepo = manager.getRepository(Invoice);
      const orderRepo = manager.getRepository(Order);

      const invoice = await invoiceRepo.findOneBy({ id: invoiceId } as any);
      if (!invoice) throw new Error('Invoice not found');

      const oldOrderIds = Array.isArray((invoice as any).orderIds)
        ? ((invoice as any).orderIds as string[])
        : [];
      const nextOrderIds = requestedOrderIds.length > 0 ? requestedOrderIds : oldOrderIds;
      if (nextOrderIds.length === 0) throw new Error('Invoice must contain at least one ticket');

      const client = await resolveClient(manager, {
        clientId: payload.clientId || (invoice as any).clientId,
        client: payload.client,
      });
      if (!client) throw new Error('Client info required for invoice');

      const nextOrders = await orderRepo.findBy({ id: In(nextOrderIds) } as any);
      if (nextOrders.length !== nextOrderIds.length) throw new Error('Some selected tickets were not found');

      const wrongInvoice = (nextOrders as any[]).find(
        (order) => order.invoiceId && order.invoiceId !== invoiceId,
      );
      if (wrongInvoice) throw new Error('Some selected tickets belong to another invoice');
      const unpaid = (nextOrders as any[]).find((order) => !isOrderPaid(order));
      if (unpaid) throw new Error('Only paid tickets can be transformed into invoice');

      const removedOrderIds = oldOrderIds.filter((id) => !nextOrderIds.includes(id));
      if (removedOrderIds.length > 0) {
        const removed = await orderRepo.findBy({ id: In(removedOrderIds) } as any);
        for (const order of removed as any[]) {
          if (order.invoiceId === invoiceId) {
            order.invoiceId = null;
            if (String(order.status || '').toUpperCase() === INVOICED_STATUS) {
              order.status = 'COMPLETED';
            }
          }
        }
        await orderRepo.save(removed as any);
      }

      const total = (nextOrders as any[]).reduce((sum, order) => sum + toNumber(order.total), 0);

      (invoice as any).clientId = client.id;
      (invoice as any).orderIds = nextOrderIds;
      (invoice as any).total = total;
      const savedInvoice = await invoiceRepo.save(invoice as any);

      for (const order of nextOrders as any[]) {
        order.clientId = client.id;
        order.invoiceId = savedInvoice.id;
        order.status = INVOICED_STATUS;
      }
      await orderRepo.save(nextOrders as any);

      return { invoice: savedInvoice, client, orders: nextOrders };
    });

    void logAppAdminAction(req, 'update', 'invoice', invoiceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function deleteInvoice(req: Request, res: Response) {
  try {
    const invoiceId = String(req.params.id || '').trim();
    if (!invoiceId) return res.status(400).json({ error: 'Missing invoice id' });

    const result = await AppDataSource.transaction(async (manager) => {
      const invoiceRepo = manager.getRepository(Invoice);
      const orderRepo = manager.getRepository(Order);

      const invoice = await invoiceRepo.findOneBy({ id: invoiceId } as any);
      if (!invoice) throw new Error('Invoice not found');

      const orderIds = Array.isArray((invoice as any).orderIds)
        ? ((invoice as any).orderIds as string[])
        : [];

      let affectedOrders: any[] = [];
      if (orderIds.length > 0) {
        affectedOrders = await orderRepo.findBy({ id: In(orderIds) } as any);
        for (const order of affectedOrders as any[]) {
          if (order.invoiceId === invoiceId) {
            order.invoiceId = null;
            order.status = restoreOrderStatusAfterInvoiceDelete(order);
          }
        }
        await orderRepo.save(affectedOrders as any);
      }

      await invoiceRepo.delete({ id: invoiceId } as any);

      return { ok: true, invoiceId, orders: affectedOrders };
    });

    void logAppAdminAction(req, 'delete', 'invoice', invoiceId);
    res.json(result);
  } catch (err) {
    const message = (err as any)?.message || 'Server error';
    if (String(message).includes('Invoice not found')) {
      return res.status(404).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
}
