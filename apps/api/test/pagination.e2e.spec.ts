import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, type TestContext } from './utils/test-app';

// Pagination optionnelle des listes (2.2). Nécessite Postgres.
describe('Pagination optionnelle des listes (e2e)', () => {
  let ctx: TestContext;
  const api = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  async function login(): Promise<Record<string, string>> {
    await seedAccount(ctx.prisma, { name: 'A', phone: '690000001', password: 'passA12345' });
    const token = (
      await api().post('/api/v1/auth/login').send({ phone: '690000001', password: 'passA12345' })
    ).body.accessToken as string;
    return { Authorization: `Bearer ${token}` };
  }

  it('dépenses : tableau sans pageSize, page { items, total } avec pageSize', async () => {
    const auth = await login();
    for (const [i, day] of ['2026-10-01', '2026-10-02', '2026-10-03'].entries()) {
      await api()
        .post('/api/v1/expenses')
        .set(auth)
        .send({ category: 'MAINTENANCE', label: `Dépense ${i + 1}`, amount: 1000, spentAt: day })
        .expect(201);
    }

    // Comportement historique : liste complète.
    const all = (await api().get('/api/v1/expenses').set(auth).expect(200)).body;
    expect(Array.isArray(all)).toBe(true);
    expect(all).toHaveLength(3);

    const page1 = (await api().get('/api/v1/expenses?pageSize=2').set(auth).expect(200)).body;
    expect(page1).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0].label).toBe('Dépense 3'); // plus récente d'abord

    const page2 = (await api().get('/api/v1/expenses?pageSize=2&page=2').set(auth).expect(200))
      .body;
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].label).toBe('Dépense 1');
  });

  it('rejette une taille de page hors bornes', async () => {
    const auth = await login();
    await api().get('/api/v1/expenses?pageSize=500').set(auth).expect(400);
    await api().get('/api/v1/contracts?pageSize=0').set(auth).expect(400);
  });

  it('maintenance, contrats et relances acceptent la pagination', async () => {
    const auth = await login();
    for (const path of ['/api/v1/maintenance', '/api/v1/contracts', '/api/v1/reminders']) {
      const res = (await api().get(`${path}?pageSize=5`).set(auth).expect(200)).body;
      expect(res).toMatchObject({ items: [], total: 0, page: 1, pageSize: 5 });
    }
  });
});
