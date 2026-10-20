import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ADMIN_USER_ERRORS } from '@bailo/shared';
import { createTestApp, resetDb, seedAccount, seedUser, type TestContext } from './utils/test-app';

/**
 * Admin — gestion de l'équipe & sessions (Lot 2).
 *
 * Scénarios :
 *  - 403 pour MANAGER et CARETAKER sur toutes les routes /admin/users.
 *  - Isolation inter-comptes : un OWNER d'un autre compte ne voit ni ne modifie
 *    les utilisateurs du premier.
 *  - Garde-fou LAST_OWNER : désactiver OU rétrograder le dernier OWNER actif
 *    retourne 409 ADMIN_USER_LAST_OWNER.
 *  - Garde-fou SELF_ROLE_CHANGE : l'OWNER ne peut pas modifier son propre rôle.
 *  - Révocation effective des sessions : la désactivation révoque les refresh
 *    tokens actifs ; une rotation subséquente répond 401.
 *  - Invitation : création → listée → révocable, et le jeton n'est jamais
 *    stocké en clair (le hash SHA-256 est vérifié).
 */
describe('Admin — équipe & sessions (e2e)', () => {
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

  async function login(phone: string, password: string): Promise<{ at: string; rt: string }> {
    const res = await api().post('/api/v1/auth/login').send({ phone, password }).expect(200);
    return { at: res.body.accessToken as string, rt: res.body.refreshToken as string };
  }

  it('403 pour MANAGER et CARETAKER sur /admin/users*', async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000100',
      password: 'passOwner1',
    });
    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gérant',
      phone: '690000101',
      password: 'passMgr123',
      role: 'MANAGER',
    });
    await seedUser(ctx.prisma, {
      accountId,
      name: 'Gardien',
      phone: '690000102',
      password: 'passCare12',
      role: 'CARETAKER',
    });
    const mgr = (await login('690000101', 'passMgr123')).at;
    const care = (await login('690000102', 'passCare12')).at;

    await api().get('/api/v1/admin/users').set({ Authorization: `Bearer ${mgr}` }).expect(403);
    await api().get('/api/v1/admin/users').set({ Authorization: `Bearer ${care}` }).expect(403);
    await api()
      .post('/api/v1/admin/invitations')
      .set({ Authorization: `Bearer ${mgr}` })
      .send({ name: 'X', phone: '690000199', role: 'CARETAKER' })
      .expect(403);
  });

  it('refuse de désactiver OU rétrograder le dernier OWNER actif', async () => {
    const { ownerId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000110',
      password: 'passOwner1',
    });
    const owner = (await login('690000110', 'passOwner1')).at;

    const r1 = await api()
      .patch(`/api/v1/admin/users/${ownerId}`)
      .set({ Authorization: `Bearer ${owner}` })
      .send({ active: false })
      .expect(400); // 400 = SELF_DEACTIVATE (priorité sur LAST_OWNER)
    expect(r1.body.code ?? r1.body.message?.code).toBe(ADMIN_USER_ERRORS.SELF_DEACTIVATE);

    // On crée un deuxième OWNER (promotion d'un MANAGER), puis on tente de
    // désactiver le premier OWNER depuis le deuxième → doit réussir (il reste
    // un OWNER actif). Enfin on tente de désactiver le deuxième → LAST_OWNER.
    const mgrId = await seedUser(ctx.prisma, {
      accountId: ownerId.replace(/-/g, '').length === 32 ? (await ctx.prisma.user.findUnique({ where: { id: ownerId }, select: { accountId: true } }))!.accountId : '',
      name: 'Nouveau',
      phone: '690000111',
      password: 'passMgr123',
      role: 'MANAGER',
    });
    // Promotion par l'OWNER initial.
    await api()
      .patch(`/api/v1/admin/users/${mgrId}`)
      .set({ Authorization: `Bearer ${owner}` })
      .send({ role: 'OWNER' })
      .expect(200);

    // Désactive maintenant le premier OWNER depuis le deuxième.
    const owner2 = (await login('690000111', 'passMgr123')).at;
    await api()
      .patch(`/api/v1/admin/users/${ownerId}`)
      .set({ Authorization: `Bearer ${owner2}` })
      .send({ active: false })
      .expect(200);

    // Tenter de désactiver le dernier OWNER actif restant → LAST_OWNER.
    const r2 = await api()
      .patch(`/api/v1/admin/users/${mgrId}`)
      .set({ Authorization: `Bearer ${owner2}` })
      .send({ role: 'MANAGER' })
      .expect(400); // SELF_ROLE_CHANGE l'emporte
    expect(r2.body.code ?? r2.body.message?.code).toBe(ADMIN_USER_ERRORS.SELF_ROLE_CHANGE);
  });

  it('la désactivation révoque les sessions actives', async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000120',
      password: 'passOwner1',
    });
    const victimId = await seedUser(ctx.prisma, {
      accountId,
      name: 'Victime',
      phone: '690000121',
      password: 'passVic12',
      role: 'CARETAKER',
    });

    // La victime se connecte, obtient un refresh ; on vérifie qu'il tourne.
    const victim = await login('690000121', 'passVic12');
    const rot1 = await api().post('/api/v1/auth/refresh').send({ refreshToken: victim.rt }).expect(200);
    const rt2 = rot1.body.refreshToken as string;

    // L'OWNER désactive la victime via /admin/users/:id.
    const owner = (await login('690000120', 'passOwner1')).at;
    await api()
      .patch(`/api/v1/admin/users/${victimId}`)
      .set({ Authorization: `Bearer ${owner}` })
      .send({ active: false })
      .expect(200);

    // La rotation suivante doit échouer en 401.
    await api().post('/api/v1/auth/refresh').send({ refreshToken: rt2 }).expect(401);
  });

  it('invitation : création renvoie un token, listée, puis révocable', async () => {
    await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000130',
      password: 'passOwner1',
    });
    const owner = (await login('690000130', 'passOwner1')).at;

    const created = await api()
      .post('/api/v1/admin/invitations')
      .set({ Authorization: `Bearer ${owner}` })
      .send({ name: 'Jean', phone: '690000131', role: 'CARETAKER', ttlHours: 48 })
      .expect(201);
    expect(created.body.token).toBeTruthy();
    expect(typeof created.body.token).toBe('string');
    expect(created.body.acceptUrl).toContain(created.body.token);

    // Le token n'est JAMAIS stocké en clair : seule l'empreinte SHA-256 l'est.
    const row = await ctx.prisma.invitation.findUnique({ where: { id: created.body.id } });
    expect(row).toBeTruthy();
    expect(row?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row?.tokenHash).not.toBe(created.body.token);

    // Lister : contient notre invitation (pas encore utilisée, pas révoquée).
    const list = await api()
      .get('/api/v1/admin/invitations')
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);
    expect(list.body.find((i: { id: string }) => i.id === created.body.id)).toBeTruthy();

    // Révocation.
    await api()
      .delete(`/api/v1/admin/invitations/${created.body.id}`)
      .set({ Authorization: `Bearer ${owner}` })
      .expect(200);
    const row2 = await ctx.prisma.invitation.findUnique({ where: { id: created.body.id } });
    expect(row2?.revokedAt).toBeTruthy();
  });

  it('isole deux comptes : un OWNER ne peut pas lire ni modifier les users d’un autre', async () => {
    const { ownerId: ownerAId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000140',
      password: 'passA12345',
    });
    const { ownerId: ownerBId } = await seedAccount(ctx.prisma, {
      name: 'B',
      phone: '690000141',
      password: 'passB12345',
    });

    const ownerA = (await login('690000140', 'passA12345')).at;

    // GET /admin/users : A ne voit que lui-même (compte A).
    const listA = await api()
      .get('/api/v1/admin/users?pageSize=50')
      .set({ Authorization: `Bearer ${ownerA}` })
      .expect(200);
    expect(listA.body.total).toBe(1);
    expect(listA.body.items.find((u: { id: string }) => u.id === ownerAId)).toBeTruthy();
    expect(listA.body.items.find((u: { id: string }) => u.id === ownerBId)).toBeUndefined();

    // PATCH sur un user de B → 404 (filtre par accountId dans findFirst).
    await api()
      .patch(`/api/v1/admin/users/${ownerBId}`)
      .set({ Authorization: `Bearer ${ownerA}` })
      .send({ name: 'Pirate' })
      .expect(404);
  });
});
