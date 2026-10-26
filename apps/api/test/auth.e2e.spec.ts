import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, type TestContext } from './utils/test-app';

// Nécessite une base Postgres joignable (docker compose up postgres).
const PHONE = '690111222';
const EMAIL = 'obelix@cite-test.cm';
const PASSWORD = 'motdepasse1';
const NATIVE = { 'X-Bailo-Client': 'native' };

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

  async function signup(): Promise<{ accessToken: string }> {
    const res = await api()
      .post('/api/v1/auth/signup')
      .send({
        accountName: 'Cité Test',
        ownerName: 'Obelix',
        email: EMAIL,
        phone: PHONE,
        password: PASSWORD,
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

  it('refuse une inscription avec un numéro déjà utilisé', async () => {
    await signup();
    await api()
      .post('/api/v1/auth/signup')
      .send({
        accountName: 'Cité X',
        ownerName: 'Propriétaire Y',
        email: 'proprio-y@cite-x.cm',
        phone: PHONE,
        password: PASSWORD,
      })
      .expect(409);
  });

  it('connexion correcte / incorrecte', async () => {
    await signup();
    await api().post('/api/v1/auth/login').send({ phone: PHONE, password: PASSWORD }).expect(200);
    await api()
      .post('/api/v1/auth/login')
      .send({ phone: PHONE, password: 'mauvais99' })
      .expect(401);
  });

  it('connexion par email', async () => {
    await signup();
    await api().post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(200);
    // L'email est normalisé (casse / espaces) côté DTO.
    await api()
      .post('/api/v1/auth/login')
      .send({ email: `  ${EMAIL.toUpperCase()} `, password: PASSWORD })
      .expect(200);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'mauvais99' })
      .expect(401);
  });

  /** Extrait la valeur du cookie de refresh d'une réponse (en-tête Set-Cookie). */
  function refreshCookie(res: { headers: Record<string, unknown> }): string | undefined {
    const raw = res.headers['set-cookie'];
    const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
    return list.find((c) => c.startsWith('bailo_rt='));
  }
  const cookieValue = (setCookie: string) => setCookie.split(';')[0]!; // « bailo_rt=… »

  it('le refresh est posé en cookie HttpOnly, jamais dans le corps (navigateur)', async () => {
    await signup();
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ phone: PHONE, password: PASSWORD })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = refreshCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('rotation par cookie : l’ancien cookie devient invalide', async () => {
    const signupRes = await api()
      .post('/api/v1/auth/signup')
      .send({
        accountName: 'Cité Test',
        ownerName: 'Obelix',
        email: EMAIL,
        phone: PHONE,
        password: PASSWORD,
      })
      .expect(201);
    const first = cookieValue(refreshCookie(signupRes)!);

    const rotated = await api().post('/api/v1/auth/refresh').set('Cookie', first).expect(200);
    expect(rotated.body.accessToken).toBeTruthy();
    expect(rotated.body.refreshToken).toBeUndefined();
    const second = cookieValue(refreshCookie(rotated)!);
    expect(second).not.toBe(first);

    // Le nouveau jeton d'accès fonctionne.
    await api()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(200);

    // Réutilisation de l'ancien cookie → rejet, et le cookie est effacé.
    const replay = await api().post('/api/v1/auth/refresh').set('Cookie', first).expect(401);
    expect(refreshCookie(replay)).toMatch(/bailo_rt=;/);
  });

  it('refresh sans cookie ni corps → 401', async () => {
    await api().post('/api/v1/auth/refresh').expect(401);
  });

  it('déconnexion : révoque le refresh du cookie et efface le cookie', async () => {
    await signup();
    const login = await api().post('/api/v1/auth/login').send({ phone: PHONE, password: PASSWORD });
    const cookie = cookieValue(refreshCookie(login)!);
    const out = await api().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    expect(refreshCookie(out)).toMatch(/bailo_rt=;/);
    await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('migration : un ancien refresh (corps) est accepté et converti en cookie', async () => {
    await signup();
    const native = await api()
      .post('/api/v1/auth/login')
      .set(NATIVE)
      .send({ phone: PHONE, password: PASSWORD })
      .expect(200);
    const legacy = native.body.refreshToken as string;
    const migrated = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: legacy })
      .expect(200);
    expect(migrated.body.refreshToken).toBeUndefined();
    expect(refreshCookie(migrated)).toBeDefined();
  });

  it('client natif : rotation du refresh dans le corps, l’ancien devient invalide', async () => {
    await signup();
    const tokens = (
      await api()
        .post('/api/v1/auth/login')
        .set(NATIVE)
        .send({ phone: PHONE, password: PASSWORD })
        .expect(200)
    ).body;
    expect(tokens.refreshToken).toBeTruthy();
    const refreshed = await api()
      .post('/api/v1/auth/refresh')
      .set(NATIVE)
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(tokens.refreshToken);
    // Réutilisation de l'ancien refresh → rejet.
    await api()
      .post('/api/v1/auth/refresh')
      .set(NATIVE)
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
