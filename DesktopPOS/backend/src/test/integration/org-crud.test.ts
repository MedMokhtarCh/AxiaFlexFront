import { describe, it, expect } from 'vitest';
import { api, unique } from '../request.js';

describe('CRUD structure & référentiels (zones, tables, imprimantes, promos, fournisseurs, utilisateurs)', () => {
  it('zones: CRUD', async () => {
    const agent = api();
    const label = unique('Zone');
    const z = await agent.post('/pos/zones').send({ name: label }).expect(200);
    const id = z.body?.id;
    expect(id).toBeTruthy();
    await agent
      .patch(`/pos/zones/${id}`)
      .send({ planX: 0, planY: 0, planW: 40, planH: 30, planFill: '#e5e7eb' })
      .expect(200);
    const z2 = await agent.get('/pos/zones').expect(200);
    const row = (z2.body as any[]).find((x) => x.id === id);
    expect(row?.planW).toBe(40);
    await agent.delete(`/pos/zones/${id}`).expect(200);
  });

  it('tables: liste, création, patch, suppression', async () => {
    const agent = api();
    const zr = await agent.post('/pos/zones').send({ name: unique('ZTbl') }).expect(200);
    const zoneId = zr.body?.id;
    expect(zoneId).toBeTruthy();
    const num = unique('T');
    const t = await agent
      .post('/pos/tables')
      .send({ number: num, zoneId, capacity: 4 })
      .expect(200);
    const id = t.body?.id;
    await agent.patch(`/pos/tables/${id}`).send({ capacity: 6 }).expect(200);
    await agent
      .patch(`/pos/tables/${id}`)
      .send({ planX: 10, planY: 20, planW: 12, planH: 10, planShape: 'square' })
      .expect(200);
    await agent.delete(`/pos/tables/${id}`).expect(200);
    await agent.delete(`/pos/zones/${zoneId}`).expect(200);
  });

  it('imprimantes: liste, création, suppression', async () => {
    const agent = api();
    await agent.get('/pos/printers').expect(200);
    const name = unique('Printer');
    const p = await agent.post('/pos/printers').send({ name, type: 'KITCHEN' }).expect(200);
    const id = p.body?.id;
    expect(id).toBeTruthy();
    await agent.delete(`/pos/printers/${id}`).expect(200);
  });

  it('promotions: CRUD', async () => {
    const agent = api();
    const name = unique('Promo');
    const pr = await agent
      .post('/pos/promotions')
      .send({
        name,
        type: 'PERIOD_PRICE',
        active: true,
        productId: null,
        promoPrice: 1,
      })
      .expect(200);
    const id = pr.body?.id;
    await agent.patch(`/pos/promotions/${id}`).send({ active: false }).expect(200);
    await agent.delete(`/pos/promotions/${id}`).expect(200);
  });

  it('fournisseurs: CRUD', async () => {
    const agent = api();
    const name = unique('Supplier');
    const s = await agent.post('/pos/suppliers').send({ name }).expect(200);
    const id = s.body?.id;
    await agent.patch(`/pos/suppliers/${id}`).send({ phone: '123456' }).expect(200);
    await agent.delete(`/pos/suppliers/${id}`).expect(200);
  });

  it('utilisateurs: liste, création, patch, suppression', async () => {
    const agent = api();
    await agent.get('/pos/users').expect(200);
    const name = unique('User');
    const u = await agent
      .post('/pos/users')
      .send({
        name,
        role: 'SERVER',
        pin: '9999',
        canManageFund: false,
      })
      .expect(200);
    const id = u.body?.id;
    await agent.patch(`/pos/users/${id}`).send({ name: `${name}2` }).expect(200);
    await agent.delete(`/pos/users/${id}`).expect(200);
  });

  it('auth: login PIN', async () => {
    const agent = api();
    const users = await agent.get('/pos/users').expect(200);
    const admin = (users.body as any[]).find((x) => x.role === 'ADMIN');
    expect(admin?.pin).toBeTruthy();
    const login = await agent
      .post('/pos/auth/login')
      .send({ pin: admin.pin })
      .expect(200);
    expect(login.body?.name).toBeTruthy();
  });
});
