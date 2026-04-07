import { describe, it, expect } from 'vitest';
import { api } from '../request.js';

describe('Paramètres et rapports (lecture / écriture safe)', () => {
  it('settings: GET et PATCH minimal', async () => {
    const agent = api();
    const cur = await agent.get('/pos/settings').expect(200);
    expect(cur.body).toBeTruthy();
    await agent
      .patch('/pos/settings')
      .send({ restaurantName: cur.body.restaurantName || 'Test' })
      .expect(200);
  });

  it('rapports ventes et caisse: réponses 200', async () => {
    const agent = api();
    const q = '?from=0&to=' + Date.now();
    await agent.get(`/pos/reports/sales/summary${q}`).expect(200);
    await agent.get(`/pos/reports/sales/by-product${q}`).expect(200);
    await agent.get(`/pos/reports/sales/by-category${q}`).expect(200);
    await agent.get(`/pos/reports/sales/by-server${q}`).expect(200);
    await agent.get(`/pos/reports/sales/by-payment-method${q}`).expect(200);
    await agent.get(`/pos/reports/sales/by-timeslot${q}&intervalMinutes=60`).expect(200);
    await agent.get(`/pos/reports/cash/closing${q}`).expect(200);
    await agent.get(`/pos/reports/customers/top${q}&limit=10`).expect(200);
  });

  it('rapports stock: réponses 200', async () => {
    const agent = api();
    const q = '?from=0&to=' + Date.now();
    await agent.get(`/pos/stock/reports/daily-movements${q}`).expect(200);
    await agent.get(`/pos/stock/reports/cogs-by-order${q}`).expect(200);
    await agent.get(`/pos/stock/reports/cogs-by-day${q}`).expect(200);
    await agent.get(`/pos/stock/reports/product-profitability${q}`).expect(200);
  });
});
