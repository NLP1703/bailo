import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, seedUser, type TestContext } from './utils/test-app';

/**
 * Protocole de synchronisation mobile (apps/mobile/docs/02-protocole-synchronisation.md)
 * et appareils (RGM10 à RGM12). Nécessite Postgres + migrations appliquées.
 */
describe('Synchronisation mobile et appareils (e2e)', () => {
  let ctx: TestContext;
  const api = () => request(ctx.app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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

  async function register(token: string, deviceId = randomUUID(), extra: object = {}) {
    const res = await api()
      .post('/api/v1/auth/device')
      .set(auth(token))
      .send({ deviceId, platform: 'android', appVersion: '1.0.0', ...extra });
    return { deviceId, res };
  }

  async function fixtures() {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'Proprio',
      phone: '690000001',
      password: 'passA12345',
    });
    const owner = await login('690000001', 'passA12345');
    const mkSite = async (name: string) =>
      (await api().post('/api/v1/sites').set(auth(owner)).send({ name, type: 'CITE' }).expect(201))
        .body as {
        id: string;
      };
    const siteA = await mkSite('Cité A');
    const siteB = await mkSite('Cité B');
    const unit = (
      await api()
        .post('/api/v1/units')
        .set(auth(owner))
        .send({ siteId: siteA.id, code: 'A01', baseRent: 25000 })
        .expect(201)
    ).body as { id: string };
    const tenant = (
      await api().post('/api/v1/tenants').set(auth(owner)).send({ name: 'Paul' }).expect(201)
    ).body as { id: string };
    const occ = (
      await api()
        .post('/api/v1/occupancies')
        .set(auth(owner))
        .send({
          unitId: unit.id,
          tenantId: tenant.id,
          startDate: '2026-09-01',
          monthlyRent: 25000,
          dueDay: 1,
          deposit: 0,
        })
        .expect(201)
    ).body as { occupancy: { id: string } };
    const meter = (
      await api()
        .post('/api/v1/meters')
        .set(auth(owner))
        .send({ unitId: unit.id, type: 'WATER', unitPrice: 500 })
        .expect(201)
    ).body as { id: string };

    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gardien',
      phone: '690000002',
      password: 'passG12345',
      role: 'CARETAKER',
      siteIds: [siteA.id],
    });
    const caretaker = await login('690000002', 'passG12345');
    return {
      accountId,
      owner,
      caretaker,
      siteA,
      siteB,
      unit,
      occupancyId: occ.occupancy.id,
      meter,
    };
  }

  let seq = 0;
  function op(type: string, siteId: string, payload: unknown, extra: Record<string, unknown> = {}) {
    seq += 1;
    return {
      opId: randomUUID(),
      seq,
      type,
      v: 1,
      siteId,
      createdAt: new Date().toISOString(),
      payload,
      ...extra,
    };
  }

  function push(token: string, deviceId: string, ops: unknown[]) {
    return api()
      .post('/api/v1/sync/push')
      .set(auth(token))
      .send({ deviceId, pendingCount: ops.length, oldestPendingAt: null, ops });
  }

  // ─── Appareils ─────────────────────────────────────────────────────────────

  it('envoi depuis un téléphone non enregistré → 409 SYNC_DEVICE_UNKNOWN', async () => {
    const f = await fixtures();
    const res = await push(f.caretaker, randomUUID(), []).expect(409);
    expect(res.body.code).toBe('SYNC_DEVICE_UNKNOWN');
  });

  it('deux téléphones au plus : le 3e doit en remplacer un (RGM10)', async () => {
    const f = await fixtures();
    const first = await register(f.caretaker);
    expect(first.res.status).toBe(200);
    expect((await register(f.caretaker)).res.status).toBe(200);

    // Réenregistrer un téléphone déjà connu ne compte pas comme un nouveau.
    expect((await register(f.caretaker, first.deviceId)).res.status).toBe(200);

    const third = await register(f.caretaker);
    expect(third.res.status).toBe(409);
    expect(third.res.body.code).toBe('DEVICE_LIMIT_REACHED');
    expect(third.res.body.details.devices).toHaveLength(2);

    const replaced = await register(f.caretaker, third.deviceId, {
      replaceDeviceId: first.deviceId,
    });
    expect(replaced.res.status).toBe(200);
    const row = await ctx.prisma.device.findFirst({ where: { deviceKey: first.deviceId } });
    expect(row?.revokedAt).not.toBeNull();
    expect(await ctx.prisma.auditLog.count({ where: { entity: 'device' } })).toBe(1);
  });

  it('le propriétaire voit tous les appareils, le gardien seulement les siens', async () => {
    const f = await fixtures();
    await register(f.owner);
    await register(f.caretaker);
    const all = await api().get('/api/v1/devices').set(auth(f.owner)).expect(200);
    expect(all.body).toHaveLength(2);
    const mine = await api().get('/api/v1/devices').set(auth(f.caretaker)).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].userName).toBe('Gardien');
  });

  it('téléphone déconnecté : saisies antérieures acceptées, postérieures refusées, réception bloquée (RGM12)', async () => {
    const f = await fixtures();
    const { deviceId, res } = await register(f.caretaker);
    const before = op('ticket.create', f.siteA.id, { title: 'Fuite douche' });

    await new Promise((r) => setTimeout(r, 20));
    await api().delete(`/api/v1/auth/devices/${res.body.id}`).set(auth(f.owner)).expect(200);
    await new Promise((r) => setTimeout(r, 20));
    const after = op('ticket.create', f.siteA.id, { title: 'Ampoule' });

    const pushed = await push(f.caretaker, deviceId, [before, after]).expect(200);
    expect(pushed.body.deviceRevoked).toBe(true);
    expect(pushed.body.results[0].status).toBe('applied');
    expect(pushed.body.results[1]).toMatchObject({
      status: 'rejected',
      errorCode: 'SYNC_DEVICE_REVOKED',
    });

    const pulled = await api()
      .get(`/api/v1/sync/pull?siteId=${f.siteA.id}`)
      .set(auth(f.caretaker))
      .set('X-Bailo-Device', deviceId)
      .expect(403);
    expect(pulled.body.code).toBe('SYNC_DEVICE_REVOKED');
  });

  it("un gardien ne peut pas déconnecter le téléphone d'un autre", async () => {
    const f = await fixtures();
    const { res } = await register(f.owner);
    await api().delete(`/api/v1/auth/devices/${res.body.id}`).set(auth(f.caretaker)).expect(403);
  });

  // ─── Envoi ─────────────────────────────────────────────────────────────────

  it('idempotence : le même opId renvoyé = un seul paiement, réponse duplicate (RGM1)', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.caretaker);
    const pay = op('payment.create', f.siteA.id, {
      occupancyId: f.occupancyId,
      amount: 10000,
      mode: 'ESPECES',
    });

    const first = await push(f.caretaker, deviceId, [pay]).expect(200);
    expect(first.body.results[0].status).toBe('applied');
    const second = await push(f.caretaker, deviceId, [pay]).expect(200);
    expect(second.body.results[0]).toMatchObject({
      status: 'duplicate',
      entityId: first.body.results[0].entityId,
    });
    await push(f.caretaker, deviceId, [pay]).expect(200);

    expect(await ctx.prisma.payment.count({ where: { clientId: pay.opId } })).toBe(1);
    const device = await ctx.prisma.device.findFirst({ where: { deviceKey: deviceId } });
    expect(device?.pendingCount).toBe(1);
  });

  it('opérations traitées dans l’ordre de seq, quel que soit l’ordre du lot (RGM2)', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.caretaker);
    const r1 = op('meterReading.create', f.siteA.id, {
      meterId: f.meter.id,
      value: 100,
      billOccupancy: false,
    });
    const r2 = op('meterReading.create', f.siteA.id, {
      meterId: f.meter.id,
      value: 120,
      billOccupancy: false,
    });
    const res = await push(f.caretaker, deviceId, [r2, r1]).expect(200);
    expect(res.body.results.map((r: { opId: string }) => r.opId)).toEqual([r1.opId, r2.opId]);
    expect(res.body.results.every((r: { status: string }) => r.status === 'applied')).toBe(true);
  });

  it('index de compteur en baisse refusé (RG19)', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.caretaker);
    const ok = op('meterReading.create', f.siteA.id, {
      meterId: f.meter.id,
      value: 200,
      billOccupancy: false,
    });
    const down = op('meterReading.create', f.siteA.id, {
      meterId: f.meter.id,
      value: 150,
      billOccupancy: false,
    });
    const res = await push(f.caretaker, deviceId, [ok, down]).expect(200);
    expect(res.body.results[0].status).toBe('applied');
    expect(res.body.results[1]).toMatchObject({
      status: 'rejected',
      errorCode: 'METER_INDEX_DECREASED',
    });

    // Même règle par la route REST.
    await api()
      .post('/api/v1/meters/readings')
      .set(auth(f.owner))
      .send({ meterId: f.meter.id, value: 10, billOccupancy: false })
      .expect(400);
  });

  it('refus détaillés : type inconnu, contenu invalide, site incohérent, date, rôle, site interdit', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.caretaker);
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const ops = [
      op('unit.delete', f.siteA.id, {}),
      op('payment.create', f.siteA.id, { occupancyId: f.occupancyId, amount: -5, mode: 'ESPECES' }),
      op('payment.create', f.siteB.id, {
        occupancyId: f.occupancyId,
        amount: 5000,
        mode: 'ESPECES',
      }),
      op('payment.create', f.siteA.id, {
        occupancyId: f.occupancyId,
        amount: 5000,
        mode: 'ESPECES',
        paidAt: old,
      }),
      op('expense.create', f.siteA.id, {
        category: 'OTHER',
        label: 'Peinture',
        amount: 1000,
        spentAt: '2026-10-01',
      }),
      op('ticket.create', f.siteB.id, { title: 'Hors de mon site' }),
    ];
    const res = await push(f.caretaker, deviceId, ops).expect(200);
    const codes = res.body.results.map((r: { errorCode?: string }) => r.errorCode);
    expect(codes).toEqual([
      'SYNC_UNSUPPORTED_OPERATION',
      'SYNC_INVALID_PAYLOAD',
      'SYNC_SITE_FORBIDDEN',
      'SYNC_DATE_OUT_OF_RANGE',
      'SYNC_FORBIDDEN',
      'SYNC_SITE_FORBIDDEN',
    ]);
    expect(await ctx.prisma.payment.count()).toBe(0);

    // Un refus est définitif : le renvoyer redonne le même refus sans rien réappliquer.
    const again = await push(f.caretaker, deviceId, [ops[1]]).expect(200);
    expect(again.body.results[0]).toMatchObject({
      status: 'rejected',
      errorCode: 'SYNC_INVALID_PAYLOAD',
    });
  });

  it('site incohérent pour le propriétaire (accès aux deux sites)', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.owner);
    const res = await push(f.owner, deviceId, [
      op('payment.create', f.siteB.id, {
        occupancyId: f.occupancyId,
        amount: 5000,
        mode: 'ESPECES',
      }),
    ]).expect(200);
    expect(res.body.results[0]).toMatchObject({
      status: 'rejected',
      errorCode: 'SYNC_SITE_MISMATCH',
    });
  });

  it('opération restée « en cours » trop longtemps → à vérifier (NEEDS_REVIEW)', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.caretaker);
    const stuck = op('ticket.create', f.siteA.id, { title: 'Porte' });
    const user = await ctx.prisma.user.findFirstOrThrow({ where: { phone: '690000002' } });
    await ctx.prisma.syncOperation.create({
      data: {
        opId: stuck.opId,
        accountId: f.accountId,
        userId: user.id,
        deviceKey: deviceId,
        type: stuck.type,
        v: 1,
        siteId: f.siteA.id,
        seq: stuck.seq,
        status: 'PROCESSING',
        clientCreatedAt: new Date(),
      },
    });

    // Récente : on attend (retry), sans rien appliquer.
    const fresh = await push(f.caretaker, deviceId, [stuck]).expect(200);
    expect(fresh.body.results[0].status).toBe('retry');

    // Valeur explicite : Prisma la garde (pas de fuseau horaire en jeu, contrairement à now()).
    await ctx.prisma.syncOperation.update({
      where: { opId: stuck.opId },
      data: { updatedAt: new Date(Date.now() - 10 * 60_000) },
    });
    const stale = await push(f.caretaker, deviceId, [stuck]).expect(200);
    expect(stale.body.results[0]).toMatchObject({
      status: 'rejected',
      errorCode: 'SYNC_NEEDS_REVIEW',
    });
    expect(await ctx.prisma.maintenanceTicket.count()).toBe(0);
  });

  it('compte en lecture seule : chaque opération est refusée, la file ne bloque pas', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.caretaker);
    await ctx.prisma.account.update({
      where: { id: f.accountId },
      data: { subscriptionEndAt: new Date(Date.now() - 60 * 86_400_000) },
    });
    const res = await push(f.caretaker, deviceId, [
      op('ticket.create', f.siteA.id, { title: 'Fuite' }),
    ]).expect(200);
    expect(res.body.results[0]).toMatchObject({
      status: 'rejected',
      errorCode: 'SYNC_ACCOUNT_READ_ONLY',
    });
  });

  it("l'ancien format du site web fonctionne toujours", async () => {
    const f = await fixtures();
    const clientId = randomUUID();
    const res = await api()
      .post('/api/v1/sync/push')
      .set(auth(f.owner))
      .send({ payments: [{ occupancyId: f.occupancyId, clientId, amount: 5000, mode: 'ESPECES' }] })
      .expect(200);
    expect(res.body.results[0]).toMatchObject({ clientId, status: 'ok' });
  });

  // ─── Réception ─────────────────────────────────────────────────────────────

  async function pullAll(
    token: string,
    deviceId: string,
    siteId: string,
    cursor: string | null,
    limit = 500,
  ) {
    const pages: Array<{
      changes: Record<string, Array<{ id: string }>>;
      cursor: string;
      hasMore: boolean;
    }> = [];
    let c = cursor;
    for (let i = 0; i < 50; i += 1) {
      const qs = new URLSearchParams({ siteId, limit: String(limit), ...(c ? { cursor: c } : {}) });
      const res = await api()
        .get(`/api/v1/sync/pull?${qs.toString()}`)
        .set(auth(token))
        .set('X-Bailo-Device', deviceId)
        .expect(200);
      pages.push(res.body);
      c = res.body.cursor;
      if (!res.body.hasMore) break;
    }
    return { pages, cursor: c };
  }

  it('réception par site : seulement le site demandé, pagination sans doublon ni trou', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.owner);
    for (let i = 2; i <= 7; i += 1) {
      await api()
        .post('/api/v1/units')
        .set(auth(f.owner))
        .send({ siteId: f.siteA.id, code: `A0${i}`, baseRent: 20000 })
        .expect(201);
    }
    await api()
      .post('/api/v1/units')
      .set(auth(f.owner))
      .send({ siteId: f.siteB.id, code: 'B01', baseRent: 20000 })
      .expect(201);

    const { pages } = await pullAll(f.owner, deviceId, f.siteA.id, null, 2);
    expect(pages.length).toBeGreaterThan(3);
    const unitIds = pages.flatMap((p) => (p.changes.units ?? []).map((u) => u.id));
    expect(unitIds).toHaveLength(7);
    expect(new Set(unitIds).size).toBe(7);
    const sites = pages.flatMap((p) => (p.changes.sites ?? []).map((s) => s.id));
    expect(sites).toEqual([f.siteA.id]);
    expect(pages.flatMap((p) => p.changes.occupancies ?? [])).toHaveLength(1);
    expect(pages.flatMap((p) => p.changes.meters ?? [])).toHaveLength(1);
  });

  it('réception incrémentale : un nouveau paiement arrive au passage suivant', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.owner);
    const first = await pullAll(f.owner, deviceId, f.siteA.id, null);
    expect(first.pages.flatMap((p) => p.changes.payments ?? [])).toHaveLength(0);

    await push(f.owner, deviceId, [
      op('payment.create', f.siteA.id, {
        occupancyId: f.occupancyId,
        amount: 7000,
        mode: 'ESPECES',
      }),
    ]).expect(200);

    const second = await pullAll(f.owner, deviceId, f.siteA.id, first.cursor);
    expect(second.pages.flatMap((p) => p.changes.payments ?? [])).toHaveLength(1);
  });

  it('chaque échéance porte le montant payé, mis à jour après paiement puis annulation', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.owner);
    type ChargeRow = { id: string; amount: number; paid: number; dueDate: string };
    const charges = (pages: Array<{ changes: Record<string, unknown[]> }>) =>
      pages.flatMap((p) => (p.changes.charges ?? []) as ChargeRow[]);

    const first = await pullAll(f.owner, deviceId, f.siteA.id, null);
    const oldest = charges(first.pages).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]!;
    expect(oldest.paid).toBe(0);

    const pay = op('payment.create', f.siteA.id, {
      occupancyId: f.occupancyId,
      amount: 7000,
      mode: 'ESPECES',
    });
    const pushed = await push(f.owner, deviceId, [pay]).expect(200);
    const afterPay = await pullAll(f.owner, deviceId, f.siteA.id, first.cursor);
    expect(charges(afterPay.pages).find((c) => c.id === oldest.id)?.paid).toBe(7000);

    // Hors de la marge du curseur : seule une échéance « touchée » revient.
    await ctx.prisma.charge.updateMany({ data: { updatedAt: new Date(Date.now() - 3_600_000) } });
    const quiet = await pullAll(f.owner, deviceId, f.siteA.id, afterPay.cursor);
    expect(charges(quiet.pages)).toHaveLength(0);

    await api()
      .post(`/api/v1/payments/${pushed.body.results[0].entityId}/void`)
      .set(auth(f.owner))
      .send({ reason: 'Erreur de saisie' })
      .expect(201);
    const afterVoid = await pullAll(f.owner, deviceId, f.siteA.id, quiet.cursor);
    expect(charges(afterVoid.pages).find((c) => c.id === oldest.id)?.paid).toBe(0);
  });

  it('le gardien déclare sa propre remise de caisse, à confirmer, et la reçoit', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.caretaker);
    const me = await ctx.prisma.user.findFirstOrThrow({ where: { phone: '690000002' } });
    const owner = await ctx.prisma.user.findFirstOrThrow({ where: { phone: '690000001' } });
    const start = new Date(Date.now() - 86_400_000).toISOString();
    const pay = op('payment.create', f.siteA.id, {
      occupancyId: f.occupancyId,
      amount: 12000,
      mode: 'ESPECES',
    });
    const mine = op('cashHandover.create', f.siteA.id, {
      collectorId: me.id,
      periodStart: start,
      periodEnd: new Date(Date.now() + 1000).toISOString(),
      handedAmount: 10000,
    });
    const notMine = op('cashHandover.create', f.siteA.id, {
      collectorId: owner.id,
      periodStart: start,
      periodEnd: new Date().toISOString(),
      handedAmount: 1,
    });
    const res = await push(f.caretaker, deviceId, [pay, mine, notMine]).expect(200);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual([
      'applied',
      'applied',
      'rejected',
    ]);

    const handover = await ctx.prisma.cashHandover.findUniqueOrThrow({
      where: { id: res.body.results[1].entityId },
    });
    expect(handover).toMatchObject({
      expectedAmount: 12000,
      handedAmount: 10000,
      variance: -2000,
      settledAt: null,
    });

    const { pages } = await pullAll(f.caretaker, deviceId, f.siteA.id, null);
    const rows = pages.flatMap((p) => p.changes.cash_handovers ?? []);
    expect(rows.map((r) => r.id)).toEqual([handover.id]);
  });

  it('photos rattachées aux saisies du téléphone (§ 6), contrôlées par compte et par usage', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.caretaker);
    const key = (purpose: string) => `accounts/${f.accountId}/${purpose}/${randomUUID()}.jpg`;
    const link = (target: { opId: string }, k: string) =>
      op('attachment.link', f.siteA.id, { targetOpId: target.opId, key: k });

    const pay = op('payment.create', f.siteA.id, {
      occupancyId: f.occupancyId,
      amount: 5000,
      mode: 'ESPECES',
    });
    const ticket = op('ticket.create', f.siteA.id, { title: 'Fuite' });
    const proof = key('payment-proof');
    const photo1 = key('ticket-photo');
    const photo2 = key('ticket-photo');
    const res = await push(f.caretaker, deviceId, [
      pay,
      ticket,
      link(pay, proof),
      link(ticket, photo1),
      link(ticket, photo2),
      link(ticket, photo2), // même photo renvoyée sous un autre opId : pas de doublon
      link(ticket, key('payment-proof')), // mauvais usage
      link(pay, `accounts/${randomUUID()}/payment-proof/x.jpg`), // autre compte
      link({ opId: randomUUID() }, key('payment-proof')), // saisie inconnue
    ]).expect(200);
    expect(
      res.body.results.map((r: { status: string; errorCode?: string }) => r.errorCode ?? r.status),
    ).toEqual([
      'applied',
      'applied',
      'applied',
      'applied',
      'applied',
      'applied',
      'SYNC_INVALID_PAYLOAD',
      'SYNC_INVALID_PAYLOAD',
      'SYNC_NOT_FOUND',
    ]);

    const payment = await ctx.prisma.payment.findUniqueOrThrow({
      where: { id: res.body.results[0].entityId },
    });
    expect(payment.proofKey).toBe(proof);
    const saved = await ctx.prisma.maintenanceTicket.findUniqueOrThrow({
      where: { id: res.body.results[1].entityId },
    });
    expect(saved.photoKeys).toEqual([photo1, photo2]);
  });

  it('un locataire supprimé est signalé aux téléphones (pierre tombale)', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.owner);
    const jean = (
      await api().post('/api/v1/tenants').set(auth(f.owner)).send({ name: 'Jean' }).expect(201)
    ).body as { id: string };
    const first = await pullAll(f.owner, deviceId, f.siteA.id, null);
    await api().delete(`/api/v1/tenants/${jean.id}`).set(auth(f.owner)).expect(200);
    const res = await api()
      .get(`/api/v1/sync/pull?siteId=${f.siteA.id}&cursor=${first.cursor}`)
      .set(auth(f.owner))
      .set('X-Bailo-Device', deviceId)
      .expect(200);
    expect(res.body.tombstones.tenants).toContain(jean.id);
  });

  it('remise à zéro du compte : le téléphone doit tout recharger', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.owner);
    const first = await pullAll(f.owner, deviceId, f.siteA.id, null);
    await ctx.prisma.syncTombstone.create({
      data: {
        accountId: f.accountId,
        tableName: '*',
        entityId: f.accountId,
        deletedAt: new Date(Date.now() + 1000),
      },
    });
    const res = await api()
      .get(`/api/v1/sync/pull?siteId=${f.siteA.id}&cursor=${first.cursor}`)
      .set(auth(f.owner))
      .set('X-Bailo-Device', deviceId)
      .expect(200);
    expect(res.body.resetRequired).toBe(true);
  });

  it('réception refusée sur un site non attribué au gardien', async () => {
    const f = await fixtures();
    const { deviceId } = await register(f.caretaker);
    await api()
      .get(`/api/v1/sync/pull?siteId=${f.siteB.id}`)
      .set(auth(f.caretaker))
      .set('X-Bailo-Device', deviceId)
      .expect(403);
  });
});
