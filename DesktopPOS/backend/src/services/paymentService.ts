import { AppDataSource } from '../data-source.js';
import { Order } from '../entity/Order.js';
import { OrderItem } from '../entity/OrderItem.js';
import { Payment } from '../entity/Payment.js';
import { PaymentItem } from '../entity/PaymentItem.js';
import { CreatePartialPaymentDto } from '../dto/CreatePartialPaymentDto.js';

export async function partialPayment(dto: CreatePartialPaymentDto) {
  return AppDataSource.transaction(async (manager) => {
    const orderRepo = manager.getRepository(Order);
    const orderItemRepo = manager.getRepository(OrderItem);
    const paymentRepo = manager.getRepository(Payment);
    const paymentItemRepo = manager.getRepository(PaymentItem);

    const order = await orderRepo.findOne({ where: { id: dto.orderId }, relations: ['items'] });
    if (!order) throw new Error('Order not found');

    let totalPaid = 0;
    const paymentItems: PaymentItem[] = [];
    for (const item of dto.items) {
      const orderItem = order.items.find(i => i.id === item.orderItemId);
      if (!orderItem) throw new Error('Order item not found');
      const remaining = orderItem.quantity - orderItem.paidQuantity;
      if (item.quantity > remaining) throw new Error('Cannot pay more than remaining quantity');
      if (remaining === 0) throw new Error('Item already fully paid');

      // Update OrderItem
      orderItem.paidQuantity += item.quantity;
      orderItem.remainingQuantity = orderItem.quantity - orderItem.paidQuantity;
      if (orderItem.paidQuantity === orderItem.quantity) {
        orderItem.status = 'PAID';
        orderItem.isLocked = true;
      } else {
        orderItem.status = 'PARTIAL';
      }
      await orderItemRepo.save(orderItem);

      // Create PaymentItem
      const pi = paymentItemRepo.create({
        orderItem,
        quantityPaid: item.quantity,
        unitPrice: orderItem.unitPrice,
        total: item.quantity * Number(orderItem.unitPrice),
      });
      paymentItems.push(pi);
      totalPaid += pi.total;
    }

    // Create Payment
    const payment = paymentRepo.create({
      code: 'TK-' + Date.now(), // Replace with your code generator
      order,
      totalPaid,
      paymentMethod: dto.paymentMethod,
      createdAt: Date.now(),
    });
    await paymentRepo.save(payment);

    // Link PaymentItems
    for (const pi of paymentItems) {
      pi.payment = payment;
      await paymentItemRepo.save(pi);
    }

    // Update Order status
    const allPaid = order.items.every(i => i.paidQuantity === i.quantity);
    order.status = allPaid ? 'PAID' : 'PARTIAL';
    await orderRepo.save(order);

    return {
      payment,
      updatedItems: order.items,
    };
  });
}

export async function getPaymentsByOrder(orderId: string) {
  const paymentRepo = AppDataSource.getRepository(Payment);
  return paymentRepo.find({ where: { order: { id: orderId } }, relations: ['order'] });
}
