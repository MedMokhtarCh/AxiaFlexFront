import { AppDataSource } from '../data-source.js';
import { Ticket } from '../entity/Ticket.js';
import { TicketItem } from '../entity/TicketItem.js';
import { Order } from '../entity/Order.js';
import { OrderItem } from '../entity/OrderItem.js';
import { generateNextPrefixedCode } from './prefixService.js';

const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuidLike = (value: unknown) => UUID_LIKE_RE.test(String(value || '').trim());

export async function createTicket(payload: any) {
  return AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Ticket);
    const code = await generateNextPrefixedCode(manager, 'ticket', { pad: 6 });
    const orderRepo = manager.getRepository(Order);
    const order = await orderRepo.findOneBy({ id: String(payload?.orderId || '') } as any);
    if (!order) throw new Error('Order not found for ticket');

    const ticket = repo.create({
      order,
      code,
      createdAt: Date.now(),
      total: Number(payload?.total ?? 0),
      discount: Number(payload?.discount ?? 0),
      timbre: Number(payload?.timbre ?? 0),
    } as any);
    const saved = await repo.save(ticket as any);

    const itemsRepo = manager.getRepository(TicketItem);
    const orderItemsRepo = manager.getRepository(OrderItem);
    const requestedItems: Array<{ id: string; quantity: number }> = Array.isArray(payload?.items)
      ? payload.items
      : [];
    for (const req of requestedItems) {
      const qty = Number((req as any).quantity || 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const reqId = String((req as any).id || '').trim();
      let line: any = null;

      if (isUuidLike(reqId)) {
        const ordItem = await orderItemsRepo.findOneBy({ id: reqId } as any);
        if (ordItem) {
          line = {
            orderItemId: ordItem.id as any,
            productId: ordItem.productId as any,
            name: ordItem.name as any,
            unitPrice: Number(ordItem.unitPrice || 0),
            quantity: qty,
            total: qty * Number(ordItem.unitPrice || 0),
          };
        }
      }

      // Fallback: lignes temporaires frontend (id cart-...) sans lookup SQL.
      if (!line) {
        const unitPrice = Number((req as any).unitPrice ?? (req as any).price ?? 0);
        line = {
          orderItemId: reqId || `tmp-${Date.now()}`,
          productId: String((req as any).productId || ''),
          name: String((req as any).name || 'Article'),
          unitPrice,
          quantity: qty,
          total: qty * unitPrice,
        };
      }

      const ti = itemsRepo.create({
        ticket: saved as any,
        ...line,
      } as any);
      await itemsRepo.save(ti as any);
    }

    return saved;
  });
}

export async function listTicketsByOrder(orderId: string) {
  const repo = AppDataSource.getRepository(Ticket);
  return repo.find({ where: { order: { id: orderId } } as any, relations: ['items'] as any });
}

export async function getTicket(id: string) {
  const repo = AppDataSource.getRepository(Ticket);
  return repo.findOne({ where: { id } as any, relations: ['items'] as any });
}
