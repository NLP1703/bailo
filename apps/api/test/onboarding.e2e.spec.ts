import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, type TestContext } from './utils/test-app';

// Mise en service (onboarding) + suppression de compte. Nécessite Postgres.
describe('Onboarding & suppression de compte (e2e)', () => {
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

  async function owner(phone = '690000001', password = 'passOwner1') {
    await seedAccount(ctx.prisma, { name: 'Cité', phone, password });
    const token = (await api().post('/api/v1/auth/login').send({ phone, password })).body
      .accessToken as string;
    return { token, auth: { Authorization: `Bearer ${token}` } };
  }

  it('crée le bâtiment et ses logements (meublé, maison décrite)', async () => {
    const { auth } = await owner();
    const res = await api()
      .post('/api/v1/sites/onboarding')
      .set(auth)
      .send({
        site: { name: 'Résidence Centrale', type: 'MIXTE', city: 'Yaoundé' },
        furnished: true,
        hasExistingTenants: false,
        units: [
          { type: 'CHAMBRE', code: 'C01', baseRent: 25000 },
          { type: 'CHAMBRE', code: 'C02', baseRent: 25000 },
          {
            type: 'MAISON',
            code: 'M01',
            baseRent: 120000,
            bedrooms: 3,
            rooms: ['salon', 'cuisine', 'douche'],
          },
        ],
      })
      .expect(201);
    expect(res.body.unitCount).toBe(3);
    const siteId = res.body.site.id as string;

    const units = await api().get(`/api/v1/units?siteId=${siteId}`).set(auth).expect(200);
    expect(units.body).toHaveLength(3);
    const maison = units.body.find((u: { code: string }) => u.code === 'M01');
    expect(maison).toMatchObject({ type: 'MAISON', furnished: true, bedrooms: 3 });
    expect(maison.rooms).toEqual(['salon', 'cuisine', 'douche']);
  });

  it('refuse des codes en double à la mise en service', async () => {
    const { auth } = await owner();
    await api()
      .post('/api/v1/sites/onboarding')
      .set(auth)
      .send({
        site: { name: 'X', type: 'CITE' },
        furnished: false,
        units: [
          { type: 'CHAMBRE', code: 'C01', baseRent: 1000 },
          { type: 'STUDIO', code: 'C01', baseRent: 2000 },
        ],
      })
      .expect(400);
  });

  it('le propriétaire supprime tout son compte', async () => {
    const { auth } = await owner();
    await api()
      .post('/api/v1/sites/onboarding')
      .set(auth)
      .send({
        site: { name: 'À supprimer', type: 'CITE' },
        furnished: false,
        units: [{ type: 'CHAMBRE', code: 'C01', baseRent: 25000 }],
      })
      .expect(201);

    await api().delete('/api/v1/account').set(auth).expect(204);
    // Le compte et son propriétaire n'existent plus : connexion impossible.
    await api()
      .post('/api/v1/auth/login')
      .send({ phone: '690000001', password: 'passOwner1' })
      .expect(401);
  });

  it('un gardien supprime son propre compte via /me', async () => {
    const { auth } = await owner();
    await api()
      .post('/api/v1/users/invite')
      .set(auth)
      .send({ name: 'Gardien', phone: '690000050', role: 'CARETAKER', password: 'passUser12' })
      .expect(201);
    const gardienAuth = {
      Authorization: `Bearer ${
        (await api().post('/api/v1/auth/login').send({ phone: '690000050', password: 'passUser12' }))
          .body.accessToken
      }`,
    };

    await api().delete('/api/v1/me').set(gardienAuth).expect(204);
    await api()
      .post('/api/v1/auth/login')
      .send({ phone: '690000050', password: 'passUser12' })
      .expect(401);
    // Le propriétaire reste intact.
    await api()
      .post('/api/v1/auth/login')
      .send({ phone: '690000001', password: 'passOwner1' })
      .expect(200);
  });
});
