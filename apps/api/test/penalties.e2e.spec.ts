import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, type TestContext } from './utils/test-app';
import { MaintenanceService } from '../src/modules/jobs/maintenance.service';

// Pénalités de retard (F5.6) générées par la maintenance. Nécessite Postgres.
describe('Pénalités de retard (e2e)', () => {
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

  it('crée une pénalité par loyer en retard, sans doublon', async () => {
    await seedAccount(ctx.prisma, { name: 'A', phone: '690000001', password: 'passA12345' });
    const token = (
      await api().post('/api/v1/auth/login').send({ phone: '690000001', password: 'passA12345' })
    ).body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const site = (
      await api().post('/api/v1/sites').set(auth).send({ name: 'Site', type: 'CITE' }).expect(201)
    ).body;
    await api()
      .patch(`/api/v1/sites/${site.id}`)
      .set(auth)
      .send({ penaltyEnabled: true, penaltyMode: 'FIXED', penaltyValue: 2000, penaltyGraceDays: 0 })
      .expect(200);

    const unit = (
      await api()
        .post('/api/v1/units')
        .set(auth)
        .send({ siteId: site.id, code: 'A01', baseRent: 25000 })
        .expect(201)
    ).body;
    const tenant = (
      await api().post('/api/v1/tenants').set(auth).send({ name: 'Paul' }).expect(201)
    ).body;

    // Occupation démarrée dans le passé, sans avance → loyers impayés échus.
    const occ = (
      await api()
        .post('/api/v1/occupancies')
        .set(auth)
        .send({
          unitId: unit.id,
          tenantId: tenant.id,
          startDate: '2026-08-01',
          monthlyRent: 25000,
          dueDay: 1,
          deposit: 0,
          paymentMode: 'ESPECES',
        })
        .expect(201)
    ).body;

    const maintenance = ctx.app.get(MaintenanceService);
    const today = new Date('2026-10-15T00:00:00Z');

    const first = await maintenance.generatePenalties(today);
    expect(first).toBe(3); // loyers d'août, septembre, octobre échus

    // Idempotent : une 2e exécution ne recrée rien.
    const second = await maintenance.generatePenalties(today);
    expect(second).toBe(0);

    const charges = (
      await api()
        .get(`/api/v1/occupancies/${occ.occupancy.id}/charges`)
        .set(auth)
        .expect(200)
    ).body as Array<{ charge: { type: string; amount: number } }>;
    const penalties = charges.filter((c) => c.charge.type === 'PENALITE');
    expect(penalties).toHaveLength(3);
    expect(penalties.every((p) => p.charge.amount === 2000)).toBe(true);
  });
});
