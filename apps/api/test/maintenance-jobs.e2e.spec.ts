import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, type TestContext } from './utils/test-app';
import { MaintenanceService } from '../src/modules/jobs/maintenance.service';

// Maintenance quotidienne (2.1) : statuts, prolongation d'échéancier — requêtes
// groupées, résultats identiques et idempotents. Nécessite Postgres.
describe('Maintenance quotidienne — requêtes groupées (e2e)', () => {
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

  /** Compte + site + chambre + occupation sans fin prévue démarrée le 01/08/2026. */
  async function seedOccupancy(): Promise<{ occupancyId: string }> {
    await seedAccount(ctx.prisma, { name: 'A', phone: '690000001', password: 'passA12345' });
    const token = (
      await api().post('/api/v1/auth/login').send({ phone: '690000001', password: 'passA12345' })
    ).body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };
    const site = (
      await api().post('/api/v1/sites').set(auth).send({ name: 'Site', type: 'CITE' }).expect(201)
    ).body;
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
    return { occupancyId: occ.occupancy.id as string };
  }

  it('met à jour les statuts échus en une passe, puis ne touche plus rien', async () => {
    const { occupancyId } = await seedOccupancy();
    const maintenance = ctx.app.get(MaintenanceService);
    const today = new Date('2026-10-15T00:00:00Z');

    const first = await maintenance.refreshChargeStatuses(today);
    expect(first).toBeGreaterThanOrEqual(3); // août, septembre, octobre échus

    const overdue = await ctx.prisma.charge.findMany({
      where: { occupancyId, type: 'LOYER', dueDate: { lt: today } },
      select: { status: true },
    });
    expect(overdue.length).toBe(3);
    expect(overdue.every((c) => c.status !== 'UPCOMING' && c.status !== 'PAID')).toBe(true);

    // Idempotent : les statuts persistés sont déjà à jour.
    expect(await maintenance.refreshChargeStatuses(today)).toBe(0);
  });

  it('prolonge l’échéancier sans doublon de période, de façon idempotente', async () => {
    const { occupancyId } = await seedOccupancy();
    const maintenance = ctx.app.get(MaintenanceService);

    const before = await ctx.prisma.occupancy.findUniqueOrThrow({ where: { id: occupancyId } });
    // Date proche de la fin de la couverture générée → la prolongation se déclenche.
    const later = new Date(before.chargesGeneratedUntil!.getTime() - 30 * 86_400_000);

    expect(await maintenance.extendSchedules(later)).toBe(1);
    const after = await ctx.prisma.occupancy.findUniqueOrThrow({ where: { id: occupancyId } });
    expect(after.chargesGeneratedUntil!.getTime()).toBeGreaterThan(
      before.chargesGeneratedUntil!.getTime(),
    );

    // Une 2e exécution à la même date ne prolonge plus (la borne a avancé).
    expect(await maintenance.extendSchedules(later)).toBe(0);

    const rents = await ctx.prisma.charge.findMany({
      where: { occupancyId, type: 'LOYER' },
      select: { periodYear: true, periodMonth: true },
    });
    const periods = new Set(rents.map((r) => `${r.periodYear}-${r.periodMonth}`));
    expect(periods.size).toBe(rents.length); // une seule échéance par mois
  });
});
