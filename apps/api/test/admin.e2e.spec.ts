import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, seedUser, type TestContext } from './utils/test-app';

/**
 * Garde-fous du module Administration (Lots 0 et 1) :
 *  - 401 sans jeton d'accès ;
 *  - 403 pour un rôle non autorisé (CARETAKER) ;
 *  - 200 pour OWNER et MANAGER, chiffres cohérents, forme stable ;
 *  - isolation stricte : un compte ne voit jamais ceux d'un autre ;
 *  - Lot 1 : jauges de quota remplies, actions sensibles enrichies des changements
 *    de rôle, dernières connexions triées, portée MANAGER restreinte aux anomalies
 *    de ses sites assignés.
 *
 * Ces tests s'appuient sur la base Postgres de test (docker compose up postgres).
 */
describe('Admin — socle, overview & guards (e2e)', () => {
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

  it('refuse l’accès sans jeton (401)', async () => {
    await api().get('/api/v1/admin/overview').expect(401);
  });

  it('refuse l’accès à un gardien (403)', async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000001',
      password: 'passOwner1',
    });
    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gardien',
      phone: '690000002',
      password: 'passCare12',
      role: 'CARETAKER',
    });
    const caretaker = await login('690000002', 'passCare12');

    await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${caretaker}` })
      .expect(403);
  });

  it('OWNER : compteurs, quotas et plan cohérents', async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000010',
      password: 'passOwner1',
    });
    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gérant',
      phone: '690000011',
      password: 'passMgr123',
      role: 'MANAGER',
    });
    const owner = await login('690000010', 'passOwner1');

    const res = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);

    expect(res.body).toMatchObject({
      accountId,
      role: 'OWNER',
      readOnly: false,
      users: { active: 2, inactive: 0, total: 2 },
      anomaliesOpen: 0,
      sensitiveActionsLast7Days: 0,
      plan: { code: 'CITE_PRO' },
    });
    // Jauges : CITE_PRO = { sites: 5, units: 300, users: 20 }
    expect(res.body.quotas).toEqual({
      sites: { used: 0, limit: 5, pct: 0 },
      units: { used: 0, limit: 300, pct: 0 },
      users: { used: 2, limit: 20, pct: 10 },
    });
    expect(Array.isArray(res.body.recentLogins)).toBe(true);
    expect(Array.isArray(res.body.recentSensitiveActions)).toBe(true);
    expect(Array.isArray(res.body.openAnomalies)).toBe(true);
  });

  it('horodate la dernière connexion et la liste dans la vue d’ensemble', async () => {
    await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000030',
      password: 'passOwner1',
    });
    // Login no 1 pour positionner `lastLoginAt`.
    await login('690000030', 'passOwner1');
    // Petit délai pour laisser l'UPDATE asynchrone passer.
    await new Promise((r) => setTimeout(r, 150));

    const owner = await login('690000030', 'passOwner1');
    const res = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);

    expect(res.body.recentLogins).toHaveLength(1);
    expect(res.body.recentLogins[0]).toMatchObject({ name: 'A', role: 'OWNER' });
    expect(res.body.recentLogins[0].lastLoginAt).toBeTruthy();
  });

  it('compte les actions sensibles (VOID / DELETE / ARCHIVE + changement de rôle)', async () => {
    const { accountId, ownerId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000040',
      password: 'passOwner1',
    });
    const victim = await seedUser(ctx.prisma, {
      accountId,
      name: 'Gérant',
      phone: '690000041',
      password: 'passMgr123',
      role: 'MANAGER',
    });

    // Insère quatre entrées d'audit — 3 doivent être comptées (VOID, DELETE,
    // UPDATE user avec rôle changé) et 1 doit être ignorée (UPDATE user sans
    // changement de rôle).
    await ctx.prisma.auditLog.createMany({
      data: [
        {
          accountId,
          actorId: ownerId,
          entity: 'payment',
          entityId: '00000000-0000-0000-0000-000000000001',
          action: 'VOID',
        },
        {
          accountId,
          actorId: ownerId,
          entity: 'tenant',
          entityId: '00000000-0000-0000-0000-000000000002',
          action: 'DELETE',
        },
        {
          accountId,
          actorId: ownerId,
          entity: 'user',
          entityId: victim,
          action: 'UPDATE',
          before: { role: 'MANAGER', name: 'Gérant' },
          after: { role: 'CARETAKER', name: 'Gérant' },
        },
        {
          accountId,
          actorId: ownerId,
          entity: 'user',
          entityId: victim,
          action: 'UPDATE',
          before: { role: 'MANAGER', name: 'Gérant' },
          after: { role: 'MANAGER', name: 'Nouveau nom' }, // pas un changement de rôle
        },
      ],
    });

    const owner = await login('690000040', 'passOwner1');
    const res = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);

    expect(res.body.sensitiveActionsLast7Days).toBe(3);
    const list = res.body.recentSensitiveActions as Array<{ action: string; isRoleChange: boolean }>;
    const roleChange = list.find((x) => x.isRoleChange);
    expect(roleChange).toBeTruthy();
    expect(roleChange?.action).toBe('UPDATE');
    expect(list.filter((x) => x.action === 'VOID')).toHaveLength(1);
    expect(list.filter((x) => x.action === 'DELETE')).toHaveLength(1);
  });

  it('MANAGER : anomalies restreintes à ses sites assignés', async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000050',
      password: 'passOwner1',
    });

    // Deux sites, le MANAGER n'est assigné qu'au premier.
    const siteA = await ctx.prisma.site.create({
      data: { accountId, name: 'Site A', type: 'CITE' },
    });
    const siteB = await ctx.prisma.site.create({
      data: { accountId, name: 'Site B', type: 'IMMEUBLE' },
    });
    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gérant',
      phone: '690000051',
      password: 'passMgr123',
      role: 'MANAGER',
      siteIds: [siteA.id],
    });

    // Deux anomalies, une par site.
    await ctx.prisma.anomaly.createMany({
      data: [
        {
          accountId,
          siteId: siteA.id,
          kind: 'LATE_PAYER',
          severity: 2,
          message: 'A : locataire en retard',
        },
        {
          accountId,
          siteId: siteB.id,
          kind: 'VACANCY_LONG',
          severity: 3,
          message: 'B : chambre vide depuis 3 mois',
        },
      ],
    });

    const owner = await login('690000050', 'passOwner1');
    const manager = await login('690000051', 'passMgr123');

    const ownerRes = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);
    expect(ownerRes.body.anomaliesOpen).toBe(2);
    expect(ownerRes.body.openAnomalies).toHaveLength(2);

    const mgrRes = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${manager}` })
      .expect(200);
    expect(mgrRes.body.anomaliesOpen).toBe(1);
    expect(mgrRes.body.openAnomalies).toHaveLength(1);
    expect(mgrRes.body.openAnomalies[0].siteId).toBe(siteA.id);
  });

  it('isole strictement deux comptes', async () => {
    await seedAccount(ctx.prisma, { name: 'A', phone: '690000060', password: 'passA12345' });
    const { accountId: idB } = await seedAccount(ctx.prisma, {
      name: 'B',
      phone: '690000061',
      password: 'passB12345',
    });
    await seedUser(ctx.prisma, {
      accountId: idB,
      name: 'Gérant B',
      phone: '690000062',
      password: 'passMgr123',
      role: 'MANAGER',
    });

    const ownerA = await login('690000060', 'passA12345');
    const ownerB = await login('690000061', 'passB12345');

    const a = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${ownerA}` })
      .expect(200);
    const b = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${ownerB}` })
      .expect(200);

    expect(a.body.users.total).toBe(1);
    expect(b.body.users.total).toBe(2);
    expect(a.body.accountId).not.toBe(b.body.accountId);
  });
});
