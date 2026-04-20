import { Request, Response } from 'express';
import * as orderService from '../services/orderService.js';
import * as printerService from '../services/printerService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';
import { AppDataSource } from '../data-source.js';
import { Order } from '../entity/Order.js';
import { OrderItem } from '../entity/OrderItem.js';
import { Payment } from '../entity/Payment.js';

export async function listOrders(req: Request, res: Response) {
  try {
    const terminalId =
      req.query?.terminalId !== undefined
        ? String(req.query.terminalId || '').trim() || null
        : undefined;
    const orders = await orderService.getOrders({ terminalId });
    res.json(orders);
  } catch (err) {
    console.error('listOrders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getOrder(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const repo = AppDataSource.getRepository(Order);
    let order = await repo.findOne({
      where: { id } as any,
    });
    if (!order) return res.status(404).json({ error: 'Not found' });
    const itemRepo = AppDataSource.getRepository(OrderItem);
    const paymentRepo = AppDataSource.getRepository(Payment);
    const items = await itemRepo.find({ where: { order: { id } } as any });
    const payments = await paymentRepo.find({ where: { order: { id } } as any });
    (order as any).items = items;
    (order as any).payments = payments;
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createOrder(req: Request, res: Response) {
  try {
    const saved = await orderService.createOrder(req.body);
    const s = saved as any;
    const items = Array.isArray(s?.items) ? s.items : [];
    void logAppAdminAction(req, 'insert', 'order', saved.id, {
      ticketNumber: s.ticketNumber ?? null,
      itemsSummary: items.map((i: any) => ({
        name: String(i.name || ''),
        qty: Number(i.quantity || 0),
      })),
    });
    res.json(saved);
  } catch (err) {
    console.error('createOrder error:', err);
    const message = String((err as any)?.message || 'Server error');
    const status = /Limite|Licence/i.test(message)
      ? 403
      : /Insufficient stock|stock/i.test(message)
        ? 409
        : 500;
    res.status(status).json({ error: message });
  }
}

export async function patchOrder(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const before = await AppDataSource.getRepository(Order).findOneBy({ id } as any);
    if (!before) return res.status(404).json({ error: 'Not found' });
    const updated = await orderService.updateOrder(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    const u = updated as any;
    const items = Array.isArray(u?.items) ? u.items : [];
    void logAppAdminAction(req, 'update', 'order', id, {
      keys: Object.keys(req.body || {}),
      ticketNumber: u.ticketNumber ?? null,
      before: {
        total: Number((before as any).total ?? 0),
        discount: Number((before as any).discount ?? 0),
        status: String((before as any).status ?? ''),
        terminalId: (before as any).terminalId ?? null,
        timbre: Number((before as any).timbre ?? 0),
        paymentMethod: (before as any).paymentMethod ?? null,
      },
      after: {
        total: Number(u.total ?? 0),
        discount: Number(u.discount ?? 0),
        status: String(u.status ?? ''),
        terminalId: u.terminalId ?? null,
        timbre: Number(u.timbre ?? 0),
        paymentMethod: u.paymentMethod ?? null,
      },
      itemsSummary: items.map((i: any) => ({
        name: String(i.name || ''),
        qty: Number(i.quantity || 0),
      })),
    });
    res.json(updated);
  } catch (err) {
    console.error('patchOrder error:', err);
    const message = (err as any)?.message || 'Server error';
    const status =
      String(message).includes('Invoiced ticket') || /Insufficient stock|stock/i.test(String(message))
        ? 409
        : 500;
    res.status(status).json({ error: message });
  }
}

export async function patchOrderStatus(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const { status } = req.body;
    const updated = await orderService.updateOrder(id, { status });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    const st = String(status || '').toUpperCase();
    const action = st === 'CANCELLED' ? 'cancel' : 'update';
    void logAppAdminAction(req, action, 'order_status', id, {
      status: st,
      ticketNumber: (updated as any)?.ticketNumber ?? null,
    });
    res.json(updated);
  } catch (err) {
    console.error('patchOrderStatus error:', err);
    const message = (err as any)?.message || 'Server error';
    const status = String(message).includes('Invoiced ticket') ? 409 : 500;
    res.status(status).json({ error: message });
  }
}

export async function addOrderPayment(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const { method, amount, createdAt, items } = req.body || {};
    const updated = await orderService.addOrderPayment(id, { method, amount, createdAt, items } as any);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'confirm', 'order_payment', id, {
      method,
      amount,
      ticketNumber: (updated as any)?.ticketNumber ?? null,
    });
    res.json(updated);
  } catch (err) {
    console.error('addOrderPayment error:', err);
    const message = (err as any)?.message || 'Server error';
    const status = String(message).includes('Invoiced ticket') ? 409 : 500;
    res.status(status).json({ error: message });
  }
}

export async function addOrderPaymentsBatch(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const { lines } = req.body || {};
    const updated = await orderService.addOrderPaymentsBatch(id, { lines } as any);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'confirm', 'order_payments_batch', id, {
      linesCount: Array.isArray(lines) ? lines.length : 0,
      ticketNumber: (updated as any)?.ticketNumber ?? null,
    });
    res.json(updated);
  } catch (err) {
    console.error('addOrderPaymentsBatch error:', err);
    const message = (err as any)?.message || 'Server error';
    const status = String(message).includes('Invoiced ticket') ? 409 : 500;
    res.status(status).json({ error: message });
  }
}

export async function printClientReceiptProvisional(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const order = await AppDataSource.getRepository(Order).findOneBy({ id } as any);
    await printerService.printProvisionalClientReceipt(id);
    void logAppAdminAction(req, 'confirm', 'print_client_receipt', id, {
      ticketNumber: (order as any)?.ticketNumber ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('printClientReceiptProvisional error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Print error' });
  }
}
