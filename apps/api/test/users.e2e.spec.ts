import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, type TestContext } from './utils/test-app';

// CRUD des utilisateurs (OWNER). Nécessite une base Postgres joignable.
describe('Utilisateurs — CRUD (e2e)', () => {
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

  async function ownerToken(): Promise<{ token: string; ownerId: string }> {
    await seedAccount(ctx.prisma, { name: 'Cité', phone: '690000001', password: 'passOwner1' });
    const token = (
      await api().post('/api/v1/auth/login').send({ phone: '690000001', password: 'passOwner1' })
    ).body.accessToken as string;
    const me = await api().get('/api/v1/me').set({ Authorization: `Bearer ${token}` });
    return { token, ownerId: me.body.id as string };
  }

  it('crée (invite), lit, modifie puis supprime un utilisateur', async () => {
    const { token } = await ownerToken();
    const auth = { Authorization: `Bearer ${token}` };

    // Create
    const created = await api()
      .post('/api/v1/users/invite')
      .set(auth)
      .send({ name: 'Gardien Un', phone: '690000010', role: 'CARETAKER', password: 'passUser12' })
      .expect(201);
    const userId = created.body.id as string;
    expect(created.body).toMatchObject({ name: 'Gardien Un', role: 'CARETAKER', active: true });

    // Read
    const list1 = await api().get('/api/v1/users').set(auth).expect(200);
    expect(list1.body.find((u: { id: string }) => u.id === userId)).toBeTruthy();

    // Update (nom, email, rôle)
    const updated = await api()
      .patch(`/api/v1/users/${userId}`)
      .set(auth)
      .send({ name: 'Gérant Un', email: 'gerant.un@cite.cm', role: 'MANAGER' })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Gérant Un',
      email: 'gerant.un@cite.cm',
      role: 'MANAGER',
    });

    // Delete
    await api().delete(`/api/v1/users/${userId}`).set(auth).expect(204);
    const list2 = await api().get('/api/v1/users').set(auth).expect(200);
    expect(list2.body.find((u: { id: string }) => u.id === userId)).toBeUndefined();
  });

  it("refuse la suppression du propriétaire et de son propre compte", async () => {
    const { token, ownerId } = await ownerToken();
    const auth = { Authorization: `Bearer ${token}` };
    await api().delete(`/api/v1/users/${ownerId}`).set(auth).expect(400);
  });

  it('un gardien ne peut pas supprimer d’utilisateur (OWNER seul)', async () => {
    const { token } = await ownerToken();
    const auth = { Authorization: `Bearer ${token}` };
    const victim = await api()
      .post('/api/v1/users/invite')
      .set(auth)
      .send({ name: 'Gardien Deux', phone: '690000020', role: 'CARETAKER', password: 'passUser12' })
      .expect(201);

    const gardienToken = (
      await api().post('/api/v1/auth/login').send({ phone: '690000020', password: 'passUser12' })
    ).body.accessToken as string;

    await api()
      .delete(`/api/v1/users/${victim.body.id}`)
      .set({ Authorization: `Bearer ${gardienToken}` })
      .expect(403);
  });
});
