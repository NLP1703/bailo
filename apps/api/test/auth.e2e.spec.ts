import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, type TestContext } from './utils/test-app';

// Nécessite une base Postgres joignable (docker compose up postgres).
const PHONE = '690111222';
const PASSWORD = 'motdepasse1';

describe('Auth (e2e)', () => {
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

  async function signup(): Promise<{ accessToken: string; refreshToken: string }> {
    await api().post('/api/v1/auth/otp').send({ phone: PHONE, purpose: 'SIGNUP' }).expect(204);
    const otp = ctx.sms.lastCode(PHONE);
    const res = await api()
      .post('/api/v1/auth/signup')
      .send({
        accountName: 'Cité Test',
        ownerName: 'Obelix',
        phone: PHONE,
        password: PASSWORD,
        otp,
      })
      .expect(201);
    expect(res.body.accessToken).toBeTruthy();
    return res.body;
  }

  it('inscription via OTP puis accès à /me', async () => {
    const tokens = await signup();
    const me = await api()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ role: 'OWNER', phone: PHONE, accountName: 'Cité Test' });
  });

  it('refuse un OTP invalide à l’inscription', async () => {
    await api().post('/api/v1/auth/otp').send({ phone: PHONE, purpose: 'SIGNUP' }).expect(204);
    await api()
      .post('/api/v1/auth/signup')
      .send({
        accountName: 'Cité X',
        ownerName: 'Propriétaire Y',
        phone: PHONE,
        password: PASSWORD,
        otp: '000000',
      })
      .expect(401);
  });

  it('connexion correcte / incorrecte', async () => {
    await signup();
    await api().post('/api/v1/auth/login').send({ phone: PHONE, password: PASSWORD }).expect(200);
    await api()
      .post('/api/v1/auth/login')
      .send({ phone: PHONE, password: 'mauvais99' })
      .expect(401);
  });

  it('rotation du refresh : l’ancien devient invalide', async () => {
    const tokens = await signup();
    const refreshed = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(tokens.refreshToken);
    // Réutilisation de l'ancien refresh → rejet.
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('réinitialisation du mot de passe par OTP', async () => {
    await signup();
    await api()
      .post('/api/v1/auth/otp')
      .send({ phone: PHONE, purpose: 'PASSWORD_RESET' })
      .expect(204);
    const otp = ctx.sms.lastCode(PHONE);
    await api()
      .post('/api/v1/auth/password-reset')
      .send({ phone: PHONE, otp, newPassword: 'nouveaupass9' })
      .expect(204);
    await api().post('/api/v1/auth/login').send({ phone: PHONE, password: PASSWORD }).expect(401);
    await api()
      .post('/api/v1/auth/login')
      .send({ phone: PHONE, password: 'nouveaupass9' })
      .expect(200);
  });

  it('une route protégée sans token renvoie 401', async () => {
    await api().get('/api/v1/me').expect(401);
  });
});
