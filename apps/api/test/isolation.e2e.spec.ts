import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, seedUser, type TestContext } from './utils/test-app';

// Nécessite une base Postgres joignable (docker compose up postgres).
describe('Isolation multi-tenant & rôles (e2e)', () => {
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

  async function login(phone: string, password: string): Promise<string> {
    const res = await api().post('/api/v1/auth/login').send({ phone, password }).expect(200);
    return res.body.accessToken as string;
  }

  async function bearer(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('un compte ne voit ni ne modifie les données d’un autre compte', async () => {
    await seedAccount(ctx.prisma, { name: 'A', phone: '690000001', password: 'passA12345' });
    await seedAccount(ctx.prisma, { name: 'B', phone: '690000002', password: 'passB12345' });
    const tokenA = await login('690000001', 'passA12345');
    const tokenB = await login('690000002', 'passB12345');

    // A crée un site, une unité, un locataire.
    const siteA = (
      await api()
        .post('/api/v1/sites')
        .set(await bearer(tokenA))
        .send({ name: 'Résidence A', type: 'CITE' })
        .expect(201)
    ).body;
    const unitA = (
      await api()
        .post('/api/v1/units')
        .set(await bearer(tokenA))
        .send({ siteId: siteA.id, code: 'A01', baseRent: 25000 })
        .expect(201)
    ).body;
    const tenantA = (
      await api()
        .post('/api/v1/tenants')
        .set(await bearer(tokenA))
        .send({ name: 'Paul Mballa', phone: '691234567' })
        .expect(201)
    ).body;

    // B ne voit pas le site de A.
    const sitesB = await api()
      .get('/api/v1/sites')
      .set(await bearer(tokenB))
      .expect(200);
    expect(sitesB.body.find((s: { id: string }) => s.id === siteA.id)).toBeUndefined();

    // B ne peut pas lire/modifier les ressources de A (404 : comme si elles n'existaient pas).
    await api()
      .patch(`/api/v1/sites/${siteA.id}`)
      .set(await bearer(tokenB))
      .send({ name: 'Piraté' })
      .expect(404);
    await api()
      .get(`/api/v1/units?siteId=${siteA.id}`)
      .set(await bearer(tokenB))
      .expect(404);
    await api()
      .patch(`/api/v1/units/${unitA.id}`)
      .set(await bearer(tokenB))
      .send({ baseRent: 1 })
      .expect(404);
    await api()
      .get(`/api/v1/tenants/${tenantA.id}`)
      .set(await bearer(tokenB))
      .expect(404);

    // La donnée de A est intacte.
    const stillA = await api()
      .patch(`/api/v1/sites/${siteA.id}`)
      .set(await bearer(tokenA))
      .send({ name: 'Résidence A' })
      .expect(200);
    expect(stillA.body.name).toBe('Résidence A');
  });

  it('un gardien ne peut pas créer de site, lister les utilisateurs, ni créer un locataire', async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000010',
      password: 'passA12345',
    });
    const owner = await login('690000010', 'passA12345');
    const site = (
      await api()
        .post('/api/v1/sites')
        .set(await bearer(owner))
        .send({ name: 'Résidence A', type: 'CITE' })
        .expect(201)
    ).body;

    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gardien',
      phone: '690000011',
      password: 'passG12345',
      role: 'CARETAKER',
      siteIds: [site.id],
    });
    const caretaker = await login('690000011', 'passG12345');

    await api()
      .post('/api/v1/sites')
      .set(await bearer(caretaker))
      .send({ name: 'X', type: 'CITE' })
      .expect(403);
    await api()
      .get('/api/v1/users')
      .set(await bearer(caretaker))
      .expect(403);
    await api()
      .post('/api/v1/tenants')
      .set(await bearer(caretaker))
      .send({ name: 'Y' })
      .expect(403);

    // Mais il consulte le plan des chambres de son site assigné.
    await api()
      .get(`/api/v1/units?siteId=${site.id}`)
      .set(await bearer(caretaker))
      .expect(200);
  });

  it('un gérant n’accède qu’aux sites qui lui sont assignés', async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000020',
      password: 'passA12345',
    });
    const owner = await login('690000020', 'passA12345');
    const site1 = (
      await api()
        .post('/api/v1/sites')
        .set(await bearer(owner))
        .send({ name: 'Site 1', type: 'CITE' })
        .expect(201)
    ).body;
    const site2 = (
      await api()
        .post('/api/v1/sites')
        .set(await bearer(owner))
        .send({ name: 'Site 2', type: 'IMMEUBLE' })
        .expect(201)
    ).body;

    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gérant',
      phone: '690000021',
      password: 'passM12345',
      role: 'MANAGER',
      siteIds: [site1.id],
    });
    const manager = await login('690000021', 'passM12345');

    // Ne liste que le site assigné.
    const sites = await api()
      .get('/api/v1/sites')
      .set(await bearer(manager))
      .expect(200);
    expect(sites.body.map((s: { id: string }) => s.id)).toEqual([site1.id]);

    // Accès refusé au site non assigné.
    await api()
      .get(`/api/v1/units?siteId=${site2.id}`)
      .set(await bearer(manager))
      .expect(403);
  });
});
