import { describe, it, expect } from 'vitest';
import { api, unique } from '../request.js';

describe('CRUD catalogue (catégories, produits)', () => {
  it('catégories: liste, création, patch, suppression', async () => {
    const agent = api();
    const list0 = await agent.get('/pos/categories').expect(200);
    expect(Array.isArray(list0.body)).toBe(true);

    const name = unique('Cat');
    const created = await agent
      .post('/pos/categories')
      .send({ name })
      .expect(200);
    expect(created.body?.name).toBe(name);
    const id = created.body?.id;
    expect(id).toBeTruthy();

    const patched = await agent
      .patch(`/pos/categories/${id}`)
      .send({ name: `${name}-upd` })
      .expect(200);
    expect(patched.body?.name).toContain('-upd');

    await agent.delete(`/pos/categories/${id}`).expect(200);
  });

  it('produits: liste, création, patch, suppression', async () => {
    const agent = api();
    await agent.get('/pos/products').expect(200);

    const name = unique('Prod');
    const created = await agent
      .post('/pos/products')
      .send({
        name,
        price: 12.5,
        category: 'Test',
        productType: 'FINISHED',
        manageStock: false,
        visibleInPos: true,
      })
      .expect(200);
    const id = created.body?.id;
    expect(id).toBeTruthy();

    await agent
      .patch(`/pos/products/${id}`)
      .send({ name: `${name}-x`, price: 13 })
      .expect(200);

    await agent.delete(`/pos/products/${id}`).expect(200);
  });
});
