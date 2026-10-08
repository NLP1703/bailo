import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, seedUser, type TestContext } from './utils/test-app';

// Nécessite une base Postgres joignable (docker compose up postgres) + migrations appliquées.
describe('Cœur financier (e2e)', () => {
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
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function baseFixtures() {
    await seedAccount(ctx.prisma, { name: 'A', phone: '690000001', password: 'passA12345' });
    const token = await login('690000001', 'passA12345');
    const site = (
      await api()
        .post('/api/v1/sites')
        .set(auth(token))
        .send({ name: 'Site S', type: 'CITE' })
        .expect(201)
    ).body;
    const unit = (
      await api()
        .post('/api/v1/units')
        .set(auth(token))
        .send({ siteId: site.id, code: 'A01', baseRent: 25000 })
        .expect(201)
    ).body;
    const tenant = (
      await api().post('/api/v1/tenants').set(auth(token)).send({ name: 'Paul' }).expect(201)
    ).body;
    return { token, site, unit, tenant };
  }

  it('P2 — 175 000 couvre caution + 6 loyers (RG5/RG6)', async () => {
    const { token, unit, tenant } = await baseFixtures();
    const occ = (
      await api()
        .post('/api/v1/occupancies')
        .set(auth(token))
        .send({
          unitId: unit.id,
          tenantId: tenant.id,
          startDate: '2026-09-01',
          monthlyRent: 25000,
          dueDay: 1,
          deposit: 25000,
          advance: { months: 6 },
          paymentMode: 'ESPECES',
        })
        .expect(201)
    ).body;
    expect(occ.openingPayment.payment.amount).toBe(175000);

    const charges = (
      await api()
        .get(`/api/v1/occupancies/${occ.occupancy.id}/charges`)
        .set(auth(token))
        .expect(200)
    ).body as Array<{ charge: { type: string }; status: string; remaining: number }>;
    const caution = charges.find((c) => c.charge.type === 'CAUTION');
    const loyers = charges.filter((c) => c.charge.type === 'LOYER');
    expect(caution?.status).toBe('PAID');
    expect(loyers.slice(0, 6).every((c) => c.status === 'PAID')).toBe(true);
    expect(loyers[6]?.status).not.toBe('PAID');
  });

  async function occupancyNoAdvance(
    token: string,
    unitId: string,
    tenantId: string,
    startDate = '2026-09-01',
  ) {
    return (
      await api()
        .post('/api/v1/occupancies')
        .set(auth(token))
        .send({ unitId, tenantId, startDate, monthlyRent: 25000, dueDay: 1, deposit: 0 })
        .expect(201)
    ).body;
  }

  /** 1er jour du mois prochain (échéance future, jamais en retard quelle que soit la date d'exécution). */
  function firstOfNextMonthISO(): string {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);
  }

  it('paiement partiel : 10 000 sur 25 000 → PARTIAL, reste 15 000 (RG7)', async () => {
    const { token, unit, tenant } = await baseFixtures();
    // Échéance future (non échue) pour isoler le statut PARTIAL de l'état « en retard » (RG10).
    const occ = await occupancyNoAdvance(token, unit.id, tenant.id, firstOfNextMonthISO());
    await api()
      .post('/api/v1/payments')
      .set(auth(token))
      .send({
        occupancyId: occ.occupancy.id,
        clientId: randomUUID(),
        amount: 10000,
        mode: 'ESPECES',
      })
      .expect(201);

    const charges = (
      await api()
        .get(`/api/v1/occupancies/${occ.occupancy.id}/charges`)
        .set(auth(token))
        .expect(200)
    ).body as Array<{ charge: { type: string }; status: string; remaining: number }>;
    const first = charges.find((c) => c.charge.type === 'LOYER');
    expect(first?.status).toBe('PARTIAL');
    expect(first?.remaining).toBe(15000);
  });

  it('idempotence hors-ligne : 3 renvois du même clientId = 1 seul paiement (NF3)', async () => {
    const { token, unit, tenant } = await baseFixtures();
    const occ = await occupancyNoAdvance(token, unit.id, tenant.id);
    const clientId = randomUUID();
    const body = { occupancyId: occ.occupancy.id, clientId, amount: 10000, mode: 'ESPECES' };

    const r1 = await api().post('/api/v1/payments').set(auth(token)).send(body).expect(201);
    const r2 = await api().post('/api/v1/payments').set(auth(token)).send(body).expect(201);
    const r3 = await api().post('/api/v1/payments').set(auth(token)).send(body).expect(201);
    expect(r2.body.idempotentReplay).toBe(true);
    expect(r3.body.payment.id).toBe(r1.body.payment.id);

    const count = await ctx.prisma.payment.count({ where: { clientId } });
    expect(count).toBe(1);
  });

  it('annulation : paiement visible + motif, solde recalculé, numéro non réutilisé (RG8/RG9)', async () => {
    const { token, unit, tenant } = await baseFixtures();
    const occ = await occupancyNoAdvance(token, unit.id, tenant.id);
    const pay = (
      await api()
        .post('/api/v1/payments')
        .set(auth(token))
        .send({
          occupancyId: occ.occupancy.id,
          clientId: randomUUID(),
          amount: 25000,
          mode: 'ESPECES',
        })
        .expect(201)
    ).body;
    const firstNumber = pay.payment.receiptNumber;

    await api()
      .post(`/api/v1/payments/${pay.payment.id}/void`)
      .set(auth(token))
      .send({ reason: 'Erreur de saisie' })
      .expect(201);

    // Le paiement reste visible avec son motif.
    const voided = await ctx.prisma.payment.findUnique({ where: { id: pay.payment.id } });
    expect(voided?.status).toBe('VOIDED');
    expect(voided?.voidReason).toBe('Erreur de saisie');

    // Solde recalculé : le loyer redevient dû.
    const charges = (
      await api()
        .get(`/api/v1/occupancies/${occ.occupancy.id}/charges`)
        .set(auth(token))
        .expect(200)
    ).body as Array<{ charge: { type: string }; remaining: number }>;
    expect(charges.find((c) => c.charge.type === 'LOYER')?.remaining).toBe(25000);

    // Un nouveau paiement obtient un numéro différent (jamais réutilisé).
    const pay2 = (
      await api()
        .post('/api/v1/payments')
        .set(auth(token))
        .send({
          occupancyId: occ.occupancy.id,
          clientId: randomUUID(),
          amount: 25000,
          mode: 'ESPECES',
        })
        .expect(201)
    ).body;
    expect(pay2.payment.receiptNumber).not.toBe(firstNumber);
  });

  it('un gardien ne peut pas annuler un paiement (matrice §2.1)', async () => {
    const { token, site, unit, tenant } = await baseFixtures();
    const account = await ctx.prisma.account.findFirst();
    await seedUser(ctx.prisma, {
      accountId: account!.id,
      name: 'Gardien',
      phone: '690000099',
      password: 'passG12345',
      role: 'CARETAKER',
      siteIds: [site.id],
    });
    const caretaker = await login('690000099', 'passG12345');
    const occ = await occupancyNoAdvance(token, unit.id, tenant.id);
    const pay = (
      await api()
        .post('/api/v1/payments')
        .set(auth(caretaker))
        .send({
          occupancyId: occ.occupancy.id,
          clientId: randomUUID(),
          amount: 10000,
          mode: 'ESPECES',
        })
        .expect(201)
    ).body;
    await api()
      .post(`/api/v1/payments/${pay.payment.id}/void`)
      .set(auth(caretaker))
      .send({ reason: 'test' })
      .expect(403);
  });

  it('RG17 — deux occupations actives se chevauchant sur une chambre non partagée sont refusées', async () => {
    const { token, unit, tenant } = await baseFixtures();
    const tenant2 = (
      await api().post('/api/v1/tenants').set(auth(token)).send({ name: 'Autre' }).expect(201)
    ).body;
    await occupancyNoAdvance(token, unit.id, tenant.id);
    const res = await api().post('/api/v1/occupancies').set(auth(token)).send({
      unitId: unit.id,
      tenantId: tenant2.id,
      startDate: '2026-10-01',
      monthlyRent: 25000,
      dueDay: 1,
      deposit: 0,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('reçu : vérification publique authentique, puis non authentique après annulation (F6.4)', async () => {
    const { token, unit, tenant } = await baseFixtures();
    const occ = await occupancyNoAdvance(token, unit.id, tenant.id);
    const pay = (
      await api()
        .post('/api/v1/payments')
        .set(auth(token))
        .send({
          occupancyId: occ.occupancy.id,
          clientId: randomUUID(),
          amount: 25000,
          mode: 'ESPECES',
        })
        .expect(201)
    ).body;

    const ok = await api().get(`/api/v1/receipts/verify/${pay.payment.id}`).expect(200);
    expect(ok.body).toMatchObject({ authentic: true, amount: 25000 });
    expect(ok.body.receiptNumber).toBeTruthy();

    await api()
      .post(`/api/v1/payments/${pay.payment.id}/void`)
      .set(auth(token))
      .send({ reason: 'annulation' })
      .expect(201);
    const ko = await api().get(`/api/v1/receipts/verify/${pay.payment.id}`).expect(200);
    expect(ko.body.authentic).toBe(false);
  });
});
