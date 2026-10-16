import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, type TestContext } from './utils/test-app';

const DAY = 86_400_000;

// Abonnements (M9) : limites par offre + lecture seule. Nécessite Postgres.
describe('Abonnements — limites & lecture seule (e2e)', () => {
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

  async function owner() {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'Cité',
      phone: '690000001',
      password: 'passOwner1',
    });
    const token = (
      await api().post('/api/v1/auth/login').send({ phone: '690000001', password: 'passOwner1' })
    ).body.accessToken as string;
    return { accountId, token, auth: { Authorization: `Bearer ${token}` } };
  }

  it('offre Découverte : limite de 5 unités', async () => {
    const { auth } = await owner();
    await api().patch('/api/v1/account/plan').set(auth).send({ plan: 'DISCOVERY' }).expect(200);
    const site = (
      await api().post('/api/v1/sites').set(auth).send({ name: 'Site', type: 'CITE' }).expect(201)
    ).body;

    for (let i = 1; i <= 5; i += 1) {
      await api()
        .post('/api/v1/units')
        .set(auth)
        .send({ siteId: site.id, code: `C0${i}`, baseRent: 25000 })
        .expect(201);
    }
    // La 6e dépasse la limite de l'offre → 402 Payment Required.
    await api()
      .post('/api/v1/units')
      .set(auth)
      .send({ siteId: site.id, code: 'C06', baseRent: 25000 })
      .expect(402);
  });

  it('compte échu : lecture seule, puis régularisation en changeant d’offre', async () => {
    const { accountId, auth } = await owner();
    // Abonnement payant échu depuis longtemps → au-delà du délai de grâce.
    await ctx.prisma.account.update({
      where: { id: accountId },
      data: { plan: 'CITE', subscriptionEndAt: new Date(Date.now() - 30 * DAY) },
    });

    const me = await api().get('/api/v1/me').set(auth).expect(200);
    expect(me.body.readOnly).toBe(true);
    expect(me.body.plan).toBe('CITE');

    // Lecture : OK. Écriture : bloquée (402).
    await api().get('/api/v1/sites').set(auth).expect(200);
    await api().post('/api/v1/sites').set(auth).send({ name: 'X', type: 'CITE' }).expect(402);

    // Changer d'offre reste autorisé même en lecture seule → régularise le compte.
    await api().patch('/api/v1/account/plan').set(auth).send({ plan: 'DISCOVERY' }).expect(200);
    await api().post('/api/v1/sites').set(auth).send({ name: 'OK', type: 'CITE' }).expect(201);
  });

  it('inscription : essai Cité Pro de 30 jours', async () => {
    await api()
      .post('/api/v1/auth/signup')
      .send({
        accountName: 'Essai',
        ownerName: 'Ola',
        email: 'ola@essai.cm',
        phone: '690000099',
        password: 'motdepasse1',
      })
      .expect(201);
    const token = (
      await api().post('/api/v1/auth/login').send({ phone: '690000099', password: 'motdepasse1' })
    ).body.accessToken as string;
    const billing = await api()
      .get('/api/v1/account/billing')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(billing.body.plan).toBe('CITE_PRO');
    expect(billing.body.readOnly).toBe(false);
    expect(billing.body.subscriptionEndAt).toBeTruthy();
  });
});
