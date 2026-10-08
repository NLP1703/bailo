import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, type TestContext } from './utils/test-app';

// Nécessite une base Postgres joignable (docker compose up postgres) + migrations.
describe('Relances, tableau de bord & exports (e2e)', () => {
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

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  async function login(phone: string, password: string) {
    return (await api().post('/api/v1/auth/login').send({ phone, password }).expect(200)).body
      .accessToken as string;
  }

  async function fixtures() {
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
      await api()
        .post('/api/v1/tenants')
        .set(auth(token))
        .send({ name: 'Paul', whatsapp: '+237690000500' })
        .expect(201)
    ).body;
    const occ = (
      await api()
        .post('/api/v1/occupancies')
        .set(auth(token))
        .send({
          unitId: unit.id,
          tenantId: tenant.id,
          startDate: '2026-10-01',
          monthlyRent: 25000,
          dueDay: 1,
          deposit: 0,
        })
        .expect(201)
    ).body;
    return { token, occ };
  }

  it('relances du jour : échéance due dans 3 jours → palier J-3, puis envoi + historique', async () => {
    const { token } = await fixtures();
    // Échéance due le 01/10 ; "aujourd'hui" = 28/09 → J-3.
    const res = await api()
      .get('/api/v1/reminders/today?date=2026-09-28')
      .set(auth(token))
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const reminder = res.body.byStage.J_MINUS_3[0];
    expect(reminder).toBeTruthy();
    expect(reminder.message).toContain('A01');

    const wa = await api()
      .get(`/api/v1/reminders/${reminder.id}/wa-link`)
      .set(auth(token))
      .expect(200);
    expect(wa.body.links[0].url).toContain('wa.me/237690000500');

    await api().post(`/api/v1/reminders/${reminder.id}/sent`).set(auth(token)).send({}).expect(201);
    const hist = await api().get('/api/v1/reminders').set(auth(token)).expect(200);
    expect(hist.body.length).toBe(1);

    // Une échéance déjà envoyée ne réapparaît pas dans la liste du jour (RG12).
    const again = await api()
      .get('/api/v1/reminders/today?date=2026-09-28')
      .set(auth(token))
      .expect(200);
    expect(again.body.total).toBe(0);
  });

  it('tableau de bord : attendu, encaissé, reste, recouvrement', async () => {
    const { token, occ } = await fixtures();
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

    const dash = await api().get('/api/v1/dashboard?month=2026-10').set(auth(token)).expect(200);
    expect(dash.body.expected).toBe(25000);
    expect(dash.body.collected).toBe(10000);
    expect(dash.body.remaining).toBe(15000);
    expect(dash.body.recoveryRate).toBe(40);
    expect(dash.body.byMode.find((m: { mode: string }) => m.mode === 'ESPECES')?.amount).toBe(
      10000,
    );
  });

  it('impayés + export CSV des paiements', async () => {
    const { token, occ } = await fixtures();
    const pay = (
      await api()
        .post('/api/v1/payments')
        .set(auth(token))
        .send({
          occupancyId: occ.occupancy.id,
          clientId: randomUUID(),
          amount: 10000,
          mode: 'ESPECES',
        })
        .expect(201)
    ).body;

    const arrears = await api().get('/api/v1/reports/arrears').set(auth(token)).expect(200);
    expect(arrears.body[0].remaining).toBe(15000);

    const csv = await api().get('/api/v1/exports/payments?format=csv').set(auth(token)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(pay.payment.receiptNumber);
  });

  it('dépense → recettes − dépenses par site dans le tableau de bord', async () => {
    const { token, occ } = await fixtures();
    const site = (await api().get('/api/v1/sites').set(auth(token)).expect(200)).body[0];
    await api()
      .post('/api/v1/payments')
      .set(auth(token))
      .send({
        occupancyId: occ.occupancy.id,
        clientId: randomUUID(),
        amount: 25000,
        mode: 'ESPECES',
        paidAt: '2026-10-05',
      })
      .expect(201);
    await api()
      .post('/api/v1/expenses')
      .set(auth(token))
      .send({ siteId: site.id, category: 'ENTRETIEN', amount: 5000, spentAt: '2026-10-06' })
      .expect(201);

    const dash = await api().get('/api/v1/dashboard?month=2026-10').set(auth(token)).expect(200);
    const line = dash.body.perSite.find((s: { siteId: string }) => s.siteId === site.id);
    expect(line.recettes).toBe(25000);
    expect(line.depenses).toBe(5000);
    expect(line.net).toBe(20000);
  });
});
