import { describe, it, expect } from 'vitest';
import { api, unique } from '../request.js';

describe('CRUD facturation (clients, factures)', () => {
  it('clients: liste, création, patch, suppression', async () => {
    const agent = api();
    await agent.get('/pos/clients').expect(200);
    const name = unique('Client');
    const c = await agent
      .post('/pos/clients')
      .send({
        type: 'PERSON',
        name,
        email: 'a@b.c',
        phone: '111',
      })
      .expect(200);
    const id = c.body?.id;
    expect(id).toBeTruthy();
    await agent.patch(`/pos/clients/${id}`).send({ phone: '222' }).expect(200);
    await agent.delete(`/pos/clients/${id}`).expect(200);
  });

  it('factures: création depuis commande payée, lecture, patch, suppression', async () => {
    const agent = api();
    const pname = unique('InvProd');
    const pr = await agent
      .post('/pos/products')
      .send({
        name: pname,
        price: 20,
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
        status: 'PENDING',
        total: 20,
        discount: 0,
        timbre: 0,
        items: [
          {
            productId,
            name: pname,
            price: 20,
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
      .send({ method: 'CASH', amount: 20 })
      .expect(200);

    const cl = await agent
      .post('/pos/clients')
      .send({ type: 'PERSON', name: unique('InvCli'), email: null, phone: null })
      .expect(200);
    const clientId = cl.body?.id;

    const inv = await agent
      .post('/pos/invoices')
      .send({ clientId, orderIds: [orderId] })
      .expect(200);
    const invoiceId = inv.body?.invoice?.id || inv.body?.id;
    expect(invoiceId).toBeTruthy();

    await agent.get(`/pos/invoices/${invoiceId}`).expect(200);

    await agent
      .patch(`/pos/invoices/${invoiceId}`)
      .send({ clientId, orderIds: [orderId] })
      .expect(200);

    await agent.delete(`/pos/invoices/${invoiceId}`).expect(200);

    // Pas de DELETE client : les commandes facturées puis libérées conservent encore clientId.
  });
});
