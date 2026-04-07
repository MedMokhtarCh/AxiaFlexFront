import { Request, Response } from 'express';
import { AppDataSource } from '../data-source.js';
import { Table } from '../entity/Table.js';
import { Order } from '../entity/Order.js';
import * as orderService from '../services/orderService.js';
import * as tableService from '../services/tableService.js';
import { emitEvent } from '../realtime.js';
import { In, Not } from 'typeorm';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

const ACTIVE_STATUSES = ['PENDING', 'PREPARING', 'READY', 'DELIVERED', 'PARTIAL'];

const getTableByToken = async (token: string) => {
  const repo = AppDataSource.getRepository(Table);
  const table = await repo.findOneBy({ token } as any);
  if (!table) return null;
  if (
    table.status === 'RESERVED' &&
    table.reservedUntil &&
    Number(table.reservedUntil) <= Date.now()
  ) {
    await tableService.updateTable(table.id, {
      status: 'AVAILABLE',
      reservedBy: null,
      reservedAt: null,
      reservedUntil: null,
    } as any);
    return repo.findOneBy({ id: table.id } as any);
  }
  return table;
};

const getActiveOrderForTable = async (table: Table) => {
  const repo = AppDataSource.getRepository(Order);
  return repo.findOne({
    where: {
      tableNumber: table.number,
      zoneId: table.zoneId,
      status: In(ACTIVE_STATUSES) as any,
    } as any,
    order: { createdAt: 'DESC' } as any,
  });
};

const ensureOrderMatchesTable = (order: Order, table: Table) => {
  return (
    String(order.tableNumber || '') === String(table.number || '') &&
    String(order.zoneId || '') === String(table.zoneId || '')
  );
};

export async function getClientTable(req: Request, res: Response) {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Missing token' });
    const table = await getTableByToken(token);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const activeOrder = await getActiveOrderForTable(table);
    res.json({
      table: {
        id: table.id,
        number: table.number,
        zoneId: table.zoneId,
        capacity: table.capacity,
        status: table.status || 'AVAILABLE',
      },
      activeOrder,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listClientOrders(req: Request, res: Response) {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Missing token' });
    const table = await getTableByToken(token);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const repo = AppDataSource.getRepository(Order);
    const orders = await repo.find({
      where: {
        tableNumber: table.number,
        zoneId: table.zoneId,
        status: Not(In(['COMPLETED', 'CANCELLED', 'INVOICED'])) as any,
      } as any,
      order: { createdAt: 'DESC' } as any,
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createClientOrder(req: Request, res: Response) {
  try {
    const { token, items, total, discount } = req.body || {};
    const trimmedToken = String(token || '').trim();
    if (!trimmedToken) return res.status(400).json({ error: 'Missing token' });

    const table = await getTableByToken(trimmedToken);
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (table.status === 'RESERVED') {
      return res.status(409).json({ error: 'Table reserved' });
    }

    const existing = await getActiveOrderForTable(table);
    if (existing) return res.json(existing);

    const saved = await orderService.createOrder({
      items,
      total,
      discount,
      type: 'DINE_IN',
      tableNumber: table.number,
      zoneId: table.zoneId,
      status: 'PENDING',
      serverName: 'CLIENT',
      print: false,
    });
    res.json(saved);
  } catch (err) {
    console.error('createClientOrder error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function patchClientOrder(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    const { token, items, total, discount } = req.body || {};
    const trimmedToken = String(token || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing order id' });
    if (!trimmedToken) return res.status(400).json({ error: 'Missing token' });

    const table = await getTableByToken(trimmedToken);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const repo = AppDataSource.getRepository(Order);
    const order = await repo.findOneBy({ id } as any);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!ensureOrderMatchesTable(order, table)) {
      return res.status(403).json({ error: 'Order does not belong to table' });
    }
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      return res.status(409).json({ error: 'Order not editable' });
    }

    const updated = await orderService.updateOrder(id, { items, total, discount });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'update', 'client_portal_order', id);
    res.json(updated);
  } catch (err) {
    console.error('patchClientOrder error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function cancelClientOrder(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    const { token } = req.body || {};
    const trimmedToken = String(token || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing order id' });
    if (!trimmedToken) return res.status(400).json({ error: 'Missing token' });

    const table = await getTableByToken(trimmedToken);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const repo = AppDataSource.getRepository(Order);
    const order = await repo.findOneBy({ id } as any);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!ensureOrderMatchesTable(order, table)) {
      return res.status(403).json({ error: 'Order does not belong to table' });
    }

    const updated = await orderService.updateOrder(id, { status: 'CANCELLED' });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    console.error('cancelClientOrder error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function requestClientPayment(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    const { token } = req.body || {};
    const trimmedToken = String(token || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing order id' });
    if (!trimmedToken) return res.status(400).json({ error: 'Missing token' });

    const table = await getTableByToken(trimmedToken);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const repo = AppDataSource.getRepository(Order);
    const order = await repo.findOneBy({ id } as any);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!ensureOrderMatchesTable(order, table)) {
      return res.status(403).json({ error: 'Order does not belong to table' });
    }

    emitEvent('orders:payment-request', {
      id: order.id,
      tableNumber: order.tableNumber,
      zoneId: order.zoneId,
      at: Date.now(),
    });

    void logAppAdminAction(req, 'confirm', 'client_portal_payment_request', order.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('requestClientPayment error:', err);
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}
