import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, seedUser, type TestContext } from './utils/test-app';

// Notifications par e-mail : reset de mot de passe lancé par l'admin et code de
// signature de contrat envoyé au locataire. Nécessite Postgres.
describe('Notifications par e-mail (e2e)', () => {
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

  async function ownerToken(phone: string, password: string): Promise<Record<string, string>> {
    const token = (await api().post('/api/v1/auth/login').send({ phone, password }).expect(200))
      .body.accessToken as string;
    return { Authorization: `Bearer ${token}` };
  }

  it('admin : reset envoyé à l’e-mail de l’utilisateur, refusé sans e-mail', async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'A',
      phone: '690000301',
      password: 'passOwner1',
    });
    const withEmail = await seedUser(ctx.prisma, {
      accountId,
      name: 'Gérant',
      phone: '690000302',
      password: 'passGerant1',
      role: 'MANAGER',
    });
    await ctx.prisma.user.update({ where: { id: withEmail }, data: { email: 'gerant@cite.cm' } });
    const withoutEmail = await seedUser(ctx.prisma, {
      accountId,
      name: 'Gardien',
      phone: '690000303',
      password: 'passGardien1',
      role: 'CARETAKER',
    });
    const auth = await ownerToken('690000301', 'passOwner1');

    const ok = await api()
      .post(`/api/v1/admin/users/${withEmail}/reset-password`)
      .set(auth)
      .expect(200);
    expect(ok.body).toEqual({ email: 'gerant@cite.cm' });
    const otp = ctx.mail.lastCode('gerant@cite.cm');
    await api()
      .post('/api/v1/auth/password-reset')
      .send({ email: 'gerant@cite.cm', otp, newPassword: 'nouveaupass9' })
      .expect(204);
    await api()
      .post('/api/v1/auth/login')
      .send({ phone: '690000302', password: 'nouveaupass9' })
      .expect(200);

    const ko = await api()
      .post(`/api/v1/admin/users/${withoutEmail}/reset-password`)
      .set(auth)
      .expect(400);
    expect(ko.body.code).toBe('USER_EMAIL_REQUIRED');
  });

  /** Compte + occupation + contrat brouillon ; renvoie le contrat et le jeton. */
  async function draftContract(tenantEmail?: string) {
    await seedAccount(ctx.prisma, {
      name: 'Cité Soleil',
      phone: '690000311',
      password: 'passOwner1',
    });
    const auth = await ownerToken('690000311', 'passOwner1');
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
      await api()
        .post('/api/v1/tenants')
        .set(auth)
        .send({ name: 'Paul', phone: '690000312', ...(tenantEmail ? { email: tenantEmail } : {}) })
        .expect(201)
    ).body;
    const occ = (
      await api()
        .post('/api/v1/occupancies')
        .set(auth)
        .send({
          unitId: unit.id,
          tenantId: tenant.id,
          startDate: '2026-10-01',
          monthlyRent: 25000,
          dueDay: 1,
          deposit: 0,
          paymentMode: 'ESPECES',
        })
        .expect(201)
    ).body;
    const contract = (
      await api()
        .post('/api/v1/contracts')
        .set(auth)
        .send({
          occupancyId: occ.occupancy.id,
          monthlyRent: 25000,
          deposit: 0,
          startDate: '2026-10-01',
          bodyHtml: `<p>${'Contrat de location — clauses. '.repeat(4)}</p>`,
        })
        .expect(201)
    ).body;
    return { auth, contract };
  }

  it('contrat : code de signature envoyé par e-mail au locataire, puis signature', async () => {
    const { auth, contract } = await draftContract('paul@etudiant.cm');
    await api()
      .post(`/api/v1/contracts/${contract.id}/send-for-signature`)
      .set(auth)
      .send({})
      .expect(201);
    const mail = ctx.mail.sentTo('paul@etudiant.cm').at(-1)!;
    expect(mail.subject).toContain(contract.reference);
    expect(mail.text).toContain('Cité Soleil');
    const otpCode = ctx.mail.lastCode('paul@etudiant.cm');

    const signed = await api()
      .post(`/api/v1/contracts/${contract.id}/sign`)
      .set(auth)
      .send({ otpCode, tenantSignatureName: 'Paul' })
      .expect(201);
    expect(signed.body.status).toBe('SIGNED');
  });

  it('contrat : refusé si le locataire n’a pas d’e-mail', async () => {
    const { auth, contract } = await draftContract();
    const res = await api()
      .post(`/api/v1/contracts/${contract.id}/send-for-signature`)
      .set(auth)
      .send({})
      .expect(400);
    expect(res.body.code).toBe('TENANT_EMAIL_REQUIRED');
  });

  it('contrat : les essais ratés sont comptés et bloquent après la limite', async () => {
    const { auth, contract } = await draftContract('paul@etudiant.cm');
    await api()
      .post(`/api/v1/contracts/${contract.id}/send-for-signature`)
      .set(auth)
      .send({})
      .expect(201);
    const good = ctx.mail.lastCode('paul@etudiant.cm');
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      await api()
        .post(`/api/v1/contracts/${contract.id}/sign`)
        .set(auth)
        .send({ otpCode: wrong, tenantSignatureName: 'Paul' })
        .expect(400);
    }
    // Même le bon code est refusé une fois la limite atteinte (OTP_MAX_ATTEMPTS = 5).
    const blocked = await api()
      .post(`/api/v1/contracts/${contract.id}/sign`)
      .set(auth)
      .send({ otpCode: good, tenantSignatureName: 'Paul' })
      .expect(400);
    expect(blocked.body.message).toMatch(/Trop d’essais/);
  });
});
