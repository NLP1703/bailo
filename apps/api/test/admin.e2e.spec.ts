import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, seedUser, type TestContext } from './utils/test-app';

/**
 * Garde-fous du socle Administration (Lot 0) :
 *  - 401 sans jeton d'accès ;
 *  - 403 pour un rôle non autorisé (CARETAKER) ;
 *  - 200 pour OWNER et MANAGER ;
 *  - isolation stricte : chaque compte ne voit que ses propres chiffres.
 *
 * Ces tests s'appuient sur la base Postgres de test (docker compose up postgres).
 */
describe('Admin — socle & guards (e2e)', () => {
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

  it('autorise OWNER et MANAGER (200), avec des chiffres cohérents', async () => {
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
    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gardien',
      phone: '690000012',
      password: 'passCare12',
      role: 'CARETAKER',
    });

    const owner = await login('690000010', 'passOwner1');
    const manager = await login('690000011', 'passMgr123');

    const ownerRes = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);
    expect(ownerRes.body).toMatchObject({
      accountId,
      role: 'OWNER',
      readOnly: false,
      users: { active: 3, inactive: 0, total: 3 },
      anomaliesOpen: 0,
      sensitiveActionsLast7Days: 0,
      plan: { code: 'CITE_PRO' },
    });

    const mgrRes = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${manager}` })
      .expect(200);
    expect(mgrRes.body.role).toBe('MANAGER');
    expect(mgrRes.body.accountId).toBe(accountId);
  });

  it('isole strictement les comptes : un OWNER ne voit que les siens', async () => {
    await seedAccount(ctx.prisma, { name: 'A', phone: '690000020', password: 'passA12345' });
    const { accountId: idB } = await seedAccount(ctx.prisma, {
      name: 'B',
      phone: '690000021',
      password: 'passB12345',
    });
    // Ajoute deux utilisateurs supplémentaires à B pour pouvoir distinguer les deux comptes.
    await seedUser(ctx.prisma, {
      accountId: idB,
      name: 'Gérant B',
      phone: '690000022',
      password: 'passMgr123',
      role: 'MANAGER',
    });
    await seedUser(ctx.prisma, {
      accountId: idB,
      name: 'Gardien B',
      phone: '690000023',
      password: 'passCare12',
      role: 'CARETAKER',
    });

    const ownerA = await login('690000020', 'passA12345');
    const ownerB = await login('690000021', 'passB12345');

    const a = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${ownerA}` })
      .expect(200);
    const b = await api()
      .get('/api/v1/admin/overview')
      .set({ Authorization: `Bearer ${ownerB}` })
      .expect(200);

    expect(a.body.users.total).toBe(1); // seul l'OWNER
    expect(b.body.users.total).toBe(3); // OWNER + MANAGER + CARETAKER
    expect(a.body.accountId).not.toBe(b.body.accountId);
  });
});
