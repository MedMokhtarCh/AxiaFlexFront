import { describe, it, expect } from 'vitest';
import { api, unique } from '../request.js';

describe('Stock : entrepôts, mouvements, documents, transferts', () => {
  it('entrepôts: liste et création', async () => {
    const agent = api();
    await agent.get('/pos/stock/warehouses').expect(200);
    const code = unique('WH');
    const w = await agent
      .post('/pos/stock/warehouses')
      .send({ code, name: `Entrepôt ${code}` })
      .expect(200);
    expect(w.body?.id).toBeTruthy();
  });

  it('mouvements stock: IN, lecture, patch note, OUT, suppression', async () => {
    const agent = api();
    const pname = unique('StkProd');
    const pr = await agent
      .post('/pos/products')
      .send({
        name: pname,
        price: 1,
        category: 'Test',
        productType: 'RAW',
        manageStock: true,
        stock: 0,
        visibleInPos: false,
      })
      .expect(200);
    const productId = pr.body?.id;

    const inn = await agent
      .post('/pos/stock/movements')
      .send({
        productId,
        type: 'IN',
        quantity: 50,
        note: 'test in',
        userName: 'vitest',
      })
      .expect(200);
    const movId = inn.body?.movement?.id;
    expect(movId).toBeTruthy();

    await agent.get('/pos/stock/movements').expect(200);

    await agent
      .patch(`/pos/stock/movements/${movId}`)
      .send({ note: 'note maj' })
      .expect(200);

    await agent
      .post('/pos/stock/movements')
      .send({
        productId,
        type: 'OUT',
        quantity: 5,
        note: 'test out',
        userName: 'vitest',
      })
      .expect(200);

    await agent.delete(`/pos/stock/movements/${movId}`).expect(200);
  });

  it('document de stock ENTRY + liste documents', async () => {
    const agent = api();
    const pname = unique('DocProd');
    const pr = await agent
      .post('/pos/products')
      .send({
        name: pname,
        price: 2,
        category: 'Test',
        productType: 'RAW',
        manageStock: true,
        stock: 10,
        visibleInPos: false,
      })
      .expect(200);
    const productId = pr.body?.id;

    const doc = await agent
      .post('/pos/stock/documents')
      .send({
        type: 'ENTRY',
        note: 'vitest doc',
        userName: 'vitest',
        lines: [{ productId, quantity: 3, movementType: 'IN' }],
      })
      .expect(200);
    expect(doc.body?.id).toBeTruthy();

    await agent.get('/pos/stock/documents').expect(200);
  });

  it('transfert: demande puis liste', async () => {
    const agent = api();
    const codeA = unique('WHA');
    const codeB = unique('WHB');
    const wa = await agent
      .post('/pos/stock/warehouses')
      .send({ code: codeA, name: `A ${codeA}` })
      .expect(200);
    const wb = await agent
      .post('/pos/stock/warehouses')
      .send({ code: codeB, name: `B ${codeB}` })
      .expect(200);

    const pname = unique('TrfProd');
    const pr = await agent
      .post('/pos/products')
      .send({
        name: pname,
        price: 1,
        category: 'Test',
        productType: 'RAW',
        manageStock: true,
        stock: 100,
        visibleInPos: false,
      })
      .expect(200);
    const productId = pr.body?.id;

    const tr = await agent
      .post('/pos/stock/transfers')
      .send({
        sourceWarehouseId: wa.body.id,
        destinationWarehouseId: wb.body.id,
        items: [{ productId, quantity: 2 }],
        note: 'vitest',
      })
      .expect(200);
    expect(tr.body?.id).toBeTruthy();

    await agent.get('/pos/stock/transfers').expect(200);
  });

  it('ajustement: demande + liste', async () => {
    const agent = api();
    const pname = unique('AdjProd');
    const pr = await agent
      .post('/pos/products')
      .send({
        name: pname,
        price: 1,
        category: 'Test',
        productType: 'RAW',
        manageStock: true,
        stock: 20,
        visibleInPos: false,
      })
      .expect(200);
    const productId = pr.body?.id;

    const adj = await agent
      .post('/pos/stock/adjustments')
      .send({
        productId,
        kind: 'CORRECTION',
        type: 'IN',
        quantity: 1,
        reason: 'vitest',
      })
      .expect(200);
    expect(adj.body?.id).toBeTruthy();

    await agent.get('/pos/stock/adjustments').expect(200);
  });
});
