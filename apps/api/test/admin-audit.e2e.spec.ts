import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, seedUser, type TestContext } from './utils/test-app';

/**
 * Admin → Journal d'audit (Lot 3).
 *
 * Scénarios :
 *  - 403 pour CARETAKER (seuls OWNER et MANAGER lisent le journal).
 *  - OWNER voit toutes les lignes du compte, MANAGER voit uniquement celles
 *    de ses sites assignés + les lignes sans siteId.
 *  - Filtre sensitiveOnly : VOID/DELETE/ARCHIVE + UPDATE user avec changement
 *    de rôle, exclut UPDATE user sans changement de rôle.
 *  - Export CSV : BOM UTF-8, séparateur `;`, respecte filtres et portée.
 *  - Immutabilité : aucune route d'écriture/suppression (404 attendu sur
 *    PATCH/DELETE /admin/audit/:id).
 */
describe('Admin — journal d\'audit (e2e)', () => {
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

  it('403 pour un gardien', async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000200',
      password: 'passOwner1',
    });
    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gardien',
      phone: '690000201',
      password: 'passCare12',
      role: 'CARETAKER',
    });
    const care = await login('690000201', 'passCare12');
    await api().get('/api/v1/admin/audit').set({ Authorization: `Bearer ${care}` }).expect(403);
  });

  it('MANAGER voit ses sites + lignes sans siteId ; OWNER voit tout', async () => {
    const { accountId, ownerId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000210',
      password: 'passOwner1',
    });
    const siteA = await ctx.prisma.site.create({
      data: { accountId, name: 'Site A', type: 'CITE' },
    });
    const siteB = await ctx.prisma.site.create({
      data: { accountId, name: 'Site B', type: 'IMMEUBLE' },
    });
    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gérant',
      phone: '690000211',
      password: 'passMgr123',
      role: 'MANAGER',
      siteIds: [siteA.id],
    });

    // 3 lignes : A (visible manager), B (invisible manager), NULL (visible manager).
    await ctx.prisma.auditLog.createMany({
      data: [
        {
          accountId, actorId: ownerId, entity: 'payment', entityId: '00000000-0000-0000-0000-000000000001',
          action: 'VOID', siteId: siteA.id,
        },
        {
          accountId, actorId: ownerId, entity: 'payment', entityId: '00000000-0000-0000-0000-000000000002',
          action: 'VOID', siteId: siteB.id,
        },
        {
          accountId, actorId: ownerId, entity: 'account', entityId: accountId,
          action: 'UPDATE', siteId: null,
        },
      ],
    });

    const owner = await login('690000210', 'passOwner1');
    const manager = await login('690000211', 'passMgr123');

    const o = await api()
      .get('/api/v1/admin/audit?pageSize=50')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);
    expect(o.body.items.length).toBe(3);

    const m = await api()
      .get('/api/v1/admin/audit?pageSize=50')
      .set({ Authorization: `Bearer ${manager}` })
      .expect(200);
    expect(m.body.items.length).toBe(2);
    expect(m.body.items.map((i: { siteId: string | null }) => i.siteId).sort()).toEqual([null, siteA.id]);
  });

  it('sensitiveOnly ne garde que VOID/DELETE/ARCHIVE + changements de rôle', async () => {
    const { accountId, ownerId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000220',
      password: 'passOwner1',
    });
    const victim = await seedUser(ctx.prisma, {
      accountId,
      name: 'V',
      phone: '690000221',
      password: 'passVic123',
      role: 'MANAGER',
    });

    await ctx.prisma.auditLog.createMany({
      data: [
        { accountId, actorId: ownerId, entity: 'payment', entityId: '00000000-0000-0000-0000-000000000003', action: 'VOID' },
        { accountId, actorId: ownerId, entity: 'tenant', entityId: '00000000-0000-0000-0000-000000000004', action: 'DELETE' },
        { accountId, actorId: ownerId, entity: 'tenant', entityId: '00000000-0000-0000-0000-000000000005', action: 'ARCHIVE' },
        // UPDATE user avec changement de rôle : KEEP.
        {
          accountId, actorId: ownerId, entity: 'user', entityId: victim, action: 'UPDATE',
          before: { role: 'MANAGER' }, after: { role: 'CARETAKER' },
        },
        // UPDATE user SANS changement de rôle : DROP.
        {
          accountId, actorId: ownerId, entity: 'user', entityId: victim, action: 'UPDATE',
          before: { role: 'MANAGER', name: 'X' }, after: { role: 'MANAGER', name: 'Y' },
        },
        // CREATE : DROP.
        { accountId, actorId: ownerId, entity: 'site', entityId: '00000000-0000-0000-0000-000000000006', action: 'CREATE' },
      ],
    });

    const owner = await login('690000220', 'passOwner1');
    const res = await api()
      .get('/api/v1/admin/audit?sensitiveOnly=true&pageSize=50')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);

    expect(res.body.items.length).toBe(4);
    const roleChange = res.body.items.find((i: { isRoleChange: boolean }) => i.isRoleChange);
    expect(roleChange).toBeTruthy();
    expect(res.body.items.every((i: { sensitive: boolean }) => i.sensitive)).toBe(true);
  });

  it('export CSV : BOM UTF-8, séparateur ; et respect des filtres', async () => {
    const { accountId, ownerId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000230',
      password: 'passOwner1',
    });
    await ctx.prisma.auditLog.createMany({
      data: [
        { accountId, actorId: ownerId, entity: 'payment', entityId: '00000000-0000-0000-0000-000000000007', action: 'VOID' },
        { accountId, actorId: ownerId, entity: 'site', entityId: '00000000-0000-0000-0000-000000000008', action: 'CREATE' },
      ],
    });

    const owner = await login('690000230', 'passOwner1');
    const res = await api()
      .get('/api/v1/admin/audit/export?sensitiveOnly=true')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8
    expect(text).toContain(';'); // séparateur attendu
    expect(text).toContain('VOID');
    expect(text).not.toContain('CREATE'); // filtre sensitiveOnly a bien tenu
  });

  it('journal en lecture seule : aucune route d\'écriture/suppression', async () => {
    await seedAccount(ctx.prisma, { name: 'A', phone: '690000240', password: 'passOwner1' });
    const owner = await login('690000240', 'passOwner1');

    await api()
      .patch('/api/v1/admin/audit/00000000-0000-0000-0000-000000000009')
      .set({ Authorization: `Bearer ${owner}` })
      .send({ reason: 'tentative' })
      .expect(404);
    await api()
      .delete('/api/v1/admin/audit/00000000-0000-0000-0000-000000000009')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(404);
  });
});
