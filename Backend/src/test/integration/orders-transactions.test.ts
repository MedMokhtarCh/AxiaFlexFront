import { describe, it, expect } from 'vitest';
import { api, unique } from '../request.js';

describe('Commandes, paiements, tickets', () => {
  it('commande: création, lecture, patch, statut, liste', async () => {
    const agent = api();
    const pname = unique('OrdProd');
    const pr = await agent
      .post('/pos/products')
      .send({
        name: pname,
        price: 5,
        category: 'Test',
        productType: 'FINISHED',
        manageStock: false,
      })
      .expect(200);
    const productId = pr.body?.id;

    const created = await agent
      .post('/pos/orders')
      .send({
        type: 'TAKE_OUT',
        status: 'PENDING',
        total: 5,
        items: [
          {
            productId,
            name: pname,
            price: 5,
            quantity: 1,
            paidQuantity: 0,
            status: 'UNPAID',
          },
        ],
      })
      .expect(200);
    const orderId = created.body?.id;
    expect(orderId).toBeTruthy();

    await agent.get(`/pos/orders/${orderId}`).expect(200);
    await agent.get('/pos/orders').expect(200);

    await agent
      .patch(`/pos/orders/${orderId}`)
      .send({
        total: 5,
        items: [
          {
            productId,
            name: pname,
            price: 5,
            quantity: 1,
            paidQuantity: 0,
            status: 'UNPAID',
          },
        ],
      })
      .expect(200);

    await agent
      .patch(`/pos/orders/${orderId}/status`)
      .send({ status: 'PREPARING' })
      .expect(200);
  });

  it('paiement sur commande + liste des paiements', async () => {
    const agent = api();
    const pname = unique('PayProd');
    const pr = await agent
      .post('/pos/products')
      .send({
        name: pname,
        price: 15,
        category: 'Test',
        productType: 'FINISHED',
        manageStock: false,
      })
      .expect(200);
    const productId = pr.body?.id;

    const ord = await agent
      .post('/pos/orders')
      .send({
        type: 'TAKE_OUT',
        total: 15,
        items: [
          {
            productId,
            name: pname,
            price: 15,
            quantity: 1,
            paidQuantity: 0,
            status: 'UNPAID',
          },
        ],
      })
      .expect(200);
    const orderId = ord.body?.id;

    await agent
      .post(`/pos/orders/${orderId}/payments`)
      .send({ method: 'BANK_CARD', amount: 15 })
      .expect(200);

    const pays = await agent.get(`/pos/payments/by-order/${orderId}`).expect(200);
    expect(Array.isArray(pays.body)).toBe(true);
  });

  it('paiement partiel (endpoint dédié)', async () => {
    const agent = api();
    const pname = unique('PartProd');
    const pr = await agent
      .post('/pos/products')
      .send({
        name: pname,
        price: 10,
        category: 'Test',
        productType: 'FINISHED',
        manageStock: false,
      })
      .expect(200);
    const productId = pr.body?.id;

    const ord = await agent
      .post('/pos/orders')
      .send({
        type: 'TAKE_OUT',
        total: 30,
        items: [
          {
            productId,
            name: pname,
            price: 10,
            quantity: 3,
            paidQuantity: 0,
            status: 'UNPAID',
          },
        ],
      })
      .expect(200);
    const orderId = ord.body?.id;

    const full = await agent.get(`/pos/orders/${orderId}`).expect(200);
    const itemId = full.body?.items?.[0]?.id;
    expect(itemId).toBeTruthy();

    await agent
      .post('/pos/payments/partial')
      .send({
        orderId,
        paymentMethod: 'CASH',
        items: [{ orderItemId: itemId, quantity: 1 }],
      })
      .expect(200);
  });

  it('ticket lié à une commande', async () => {
    const agent = api();
    const pname = unique('TktProd');
    const pr = await agent
      .post('/pos/products')
      .send({
        name: pname,
        price: 8,
        category: 'Test',
        productType: 'FINISHED',
        manageStock: false,
      })
      .expect(200);
    const productId = pr.body?.id;

    const ord = await agent
      .post('/pos/orders')
      .send({
        type: 'TAKE_OUT',
        total: 8,
        items: [
          {
            productId,
            name: pname,
            price: 8,
            quantity: 1,
            paidQuantity: 0,
            status: 'UNPAID',
          },
        ],
      })
      .expect(200);
    const orderId = ord.body?.id;

    const loaded = await agent.get(`/pos/orders/${orderId}`).expect(200);
    const lineId = loaded.body?.items?.[0]?.id;
    expect(lineId).toBeTruthy();

    await agent
      .post(`/pos/orders/${orderId}/tickets`)
      .send({ total: 8, items: [{ id: lineId, quantity: 1 }] })
      .expect(200);

    const tickets = await agent.get(`/pos/orders/${orderId}/tickets`).expect(200);
    expect(Array.isArray(tickets.body)).toBe(true);
  });
});
