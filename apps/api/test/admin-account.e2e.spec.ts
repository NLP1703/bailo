import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedAccount, type TestContext } from './utils/test-app';

/**
 * Admin — paramètres du compte (Lot 4).
 *
 * Scénarios :
 *  - Un préfixe de reçu invalide (minuscule, espace, > 6 caractères) est rejeté
 *    en 400 par la validation Zod côté API.
 *  - Changer le préfixe n'altère pas les reçus déjà émis : la numérotation
 *    `ReceiptSequence` reste intacte, seule l'écriture future utilise le
 *    nouveau préfixe (vérifié par un GET après PATCH).
 *  - L'URL de vérification en HTTPS est acceptée.
 */
describe('Admin — paramètres du compte (e2e)', () => {
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

  async function loginOwner(phone: string, password: string): Promise<string> {
    const res = await api().post('/api/v1/auth/login').send({ phone, password }).expect(200);
    return res.body.accessToken as string;
  }

  it('rejette un préfixe de reçu invalide (minuscule / caractère spécial / trop long)', async () => {
    await seedAccount(ctx.prisma, { name: 'ACC', phone: '690000400', password: 'passOwner1' });
    const at = await loginOwner('690000400', 'passOwner1');

    for (const bad of ['bl', 'AB CD', 'TOOLONG12']) {
      await api()
        .patch('/api/v1/admin/account')
        .set('Authorization', `Bearer ${at}`)
        .send({ receiptPrefix: bad })
        .expect(400);
    }
  });

  it("ne touche pas aux reçus déjà émis quand on change le préfixe", async () => {
    const { accountId } = await seedAccount(ctx.prisma, {
      name: 'ACC',
      phone: '690000401',
      password: 'passOwner1',
    });
    // Reçu déjà émis sous l'ancien préfixe (BL par défaut) → numéro BL-2026-000001.
    await ctx.prisma.receiptSequence.create({
      data: { accountId, year: new Date().getUTCFullYear(), lastValue: 1 },
    });

    const at = await loginOwner('690000401', 'passOwner1');
    await api()
      .patch('/api/v1/admin/account')
      .set('Authorization', `Bearer ${at}`)
      .send({ receiptPrefix: 'CG' })
      .expect(200);

    // La séquence pour l'année en cours reste inchangée : les reçus émis sous
    // l'ancien préfixe (BL-2026-000001) ne sont ni renumérotés ni masqués.
    const seq = await ctx.prisma.receiptSequence.findMany({ where: { accountId } });
    expect(seq).toHaveLength(1);
    expect(seq[0]!.lastValue).toBe(1);

    const res = await api()
      .get('/api/v1/admin/account')
      .set('Authorization', `Bearer ${at}`)
      .expect(200);
    expect(res.body.receiptPrefix).toBe('CG');
  });

  it('accepte une URL HTTPS valide pour la vérification des reçus', async () => {
    await seedAccount(ctx.prisma, { name: 'ACC', phone: '690000402', password: 'passOwner1' });
    const at = await loginOwner('690000402', 'passOwner1');

    const res = await api()
      .patch('/api/v1/admin/account')
      .set('Authorization', `Bearer ${at}`)
      .send({ verifyBaseUrl: 'https://verify.bailo.example' })
      .expect(200);
    expect(res.body.verifyBaseUrl).toBe('https://verify.bailo.example');
  });
});
