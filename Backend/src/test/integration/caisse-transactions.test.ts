import { describe, it, expect } from 'vitest';
import { api, unique } from '../request.js';

describe('Caisse : fonds, shift, session de caisse, mouvements', () => {
  it('fonds: création, patch, liste (sans suppression si sessions)', async () => {
    const agent = api();
    const name = unique('Fond');
    const f = await agent
      .post('/pos/funds')
      .send({ name, currency: 'TND', isActive: true })
      .expect(200);
    const fundId = f.body?.id;
    expect(fundId).toBeTruthy();

    await agent.patch(`/pos/funds/${fundId}`).send({ name: `${name}2` }).expect(200);
    await agent.get('/pos/funds').expect(200);
  });

  it('shift ouvert → session caisse → mouvement → fermetures', async () => {
    const agent = api();
    const users = await agent.get('/pos/users').expect(200);
    const admin = (users.body as any[]).find((u) => u.role === 'ADMIN');
    expect(admin?.id).toBeTruthy();

    const funds = await agent.get('/pos/funds').expect(200);
    let fundId = (funds.body as any[]).find((f) => f.isActive)?.id;
    if (!fundId) {
      const nf = await agent
        .post('/pos/funds')
        .send({ name: unique('FondActif'), currency: 'TND', isActive: true })
        .expect(200);
      fundId = nf.body.id;
    }

    const shiftRes = await agent
      .post('/pos/shifts/open')
      .send({
        cashierId: admin.id,
        cashierName: admin.name,
        fundId,
        role: 'ADMIN',
        openingFund: 0,
      })
      .expect(200);
    const shiftId = shiftRes.body?.id;
    expect(shiftId).toBeTruthy();

    const sess = await agent
      .post('/pos/fund-sessions/open')
      .send({
        fundId,
        shiftId,
        cashierId: admin.id,
        cashierName: admin.name,
        openingBalance: 100,
      })
      .expect(200);
    const sessionId = sess.body?.id;
    expect(sessionId).toBeTruthy();

    await agent
      .post('/pos/fund-sessions/movement')
      .send({
        sessionId,
        type: 'IN',
        amount: 10,
        reason: 'Test vitest',
        userId: admin.id,
        userName: admin.name,
      })
      .expect(200);

    await agent.get('/pos/fund-sessions/movements').query({ sessionId }).expect(200);

    await agent
      .post('/pos/fund-sessions/close')
      .send({
        sessionId,
        closingBalance: 110,
        cashierId: admin.id,
      })
      .expect(200);

    await agent
      .post('/pos/shifts/close')
      .send({ shiftId, closingFund: 0 })
      .expect(200);
  });

  it('sessions POS (legacy): get + open si shift actif', async () => {
    const agent = api();
    await agent.get('/pos/session').expect(200);
    const users = await agent.get('/pos/users').expect(200);
    const admin = (users.body as any[]).find((u) => u.role === 'ADMIN');

    const shiftRes = await agent
      .post('/pos/shifts/open')
      .send({
        cashierId: admin.id,
        cashierName: admin.name,
        role: 'ADMIN',
      })
      .expect(200);
    const shiftId = shiftRes.body?.id;

    const funds = await agent.get('/pos/funds').expect(200);
    const fundId = (funds.body as any[]).find((f) => f.isActive)?.id;
    expect(fundId).toBeTruthy();

    await agent
      .post('/pos/fund-sessions/open')
      .send({
        fundId,
        shiftId,
        cashierId: admin.id,
        cashierName: admin.name,
        openingBalance: 50,
      })
      .expect(200);

    await agent.post('/pos/session/open').send({ initialFund: 50 }).expect(200);

    await agent
      .post('/pos/session/movement')
      .send({
        type: 'IN',
        amount: 5,
        reason: 'Vitest',
        userId: admin.id,
        userName: admin.name,
      })
      .expect(200);

    const closedLegacy = await agent
      .post('/pos/session/close')
      .send({ closingBalance: 55, notes: 'Vitest legacy close' })
      .expect(200);
    expect(Number(closedLegacy.body?.closingBalance)).toBe(55);

    const ledger = await agent
      .get('/pos/fund-sessions')
      .query({ status: 'CLOSED', cashierId: admin.id })
      .expect(200);
    const row = (ledger.body as any[]).find(
      (s) => s.shiftId === shiftId && Number(s.closingBalance) === 55,
    );
    expect(row).toBeTruthy();

    await agent.get('/pos/shifts').expect(200);
    await agent.get('/pos/shifts/summary').expect(200);

    await agent
      .post('/pos/shifts/close')
      .send({ shiftId, closingFund: 0 })
      .expect(200);
  });
});
