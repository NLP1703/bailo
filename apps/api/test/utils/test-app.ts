import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import type { UserRole } from '@bailo/shared';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { HttpAdapterHost } from '@nestjs/core';
import { PrismaExceptionFilter } from '../../src/common/http/prisma-exception.filter';
import { AllExceptionsFilter } from '../../src/common/monitoring/all-exceptions.filter';
import { SMS_PROVIDER, type SmsProvider } from '../../src/modules/sms/sms.provider';

/** Fournisseur SMS de test : capture les messages pour extraire l'OTP. */
export class CapturingSmsProvider implements SmsProvider {
  readonly messages: { phone: string; message: string }[] = [];
  async send(phone: string, message: string): Promise<void> {
    this.messages.push({ phone, message });
  }
  lastCode(phone: string): string {
    const entry = [...this.messages].reverse().find((m) => m.phone === phone);
    const match = entry ? /(\d{6})/.exec(entry.message) : null;
    if (!match) throw new Error(`Aucun OTP capturé pour ${phone}`);
    return match[1]!;
  }
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  sms: CapturingSmsProvider;
}

/** Renseigne des variables d'env par défaut si absentes (exécution hors docker). */
function ensureEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
  process.env.JWT_ACCESS_TTL ??= '15m';
  process.env.JWT_REFRESH_TTL ??= '30d';
  process.env.DATABASE_URL ??=
    'postgresql://bailo:bailo@localhost:5432/bailo_test?schema=public';
}

export async function createTestApp(): Promise<TestContext> {
  ensureEnv();
  const sms = new CapturingSmsProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(
    new AllExceptionsFilter(app.get(HttpAdapterHost).httpAdapter),
    new PrismaExceptionFilter(),
  );
  app.useGlobalPipes(new ValidationPipe({ transform: false, whitelist: false }));
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma, sms };
}

/** Vide toutes les tables (ordre respectant les clés étrangères). */
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_log","reminder","allocation","payment","charge","occupancy",
      "cash_handover","expense","guarantor","tenant","unit","block","site",
      "template","receipt_sequence","refresh_token","otp_code","user_site",
      "user","account"
    RESTART IDENTITY CASCADE;
  `);
}

/** Crée directement un compte + son propriétaire (mot de passe connu), sans OTP. */
export async function seedAccount(
  prisma: PrismaService,
  opts: { name: string; phone: string; password: string },
): Promise<{ accountId: string; ownerId: string }> {
  const passwordHash = await argon2.hash(opts.password);
  // Plan non limitant par défaut pour les fixtures (échéance lointaine).
  const account = await prisma.account.create({
    data: {
      name: opts.name,
      phone: opts.phone,
      plan: 'CITE_PRO',
      subscriptionEndAt: new Date(Date.now() + 365 * 86_400_000),
    },
  });
  const owner = await prisma.user.create({
    data: {
      accountId: account.id,
      name: opts.name,
      phone: opts.phone,
      passwordHash,
      role: 'OWNER',
    },
  });
  return { accountId: account.id, ownerId: owner.id };
}

/** Crée un utilisateur secondaire (gérant/gardien) avec sites assignés. */
export async function seedUser(
  prisma: PrismaService,
  opts: {
    accountId: string;
    name: string;
    phone: string;
    password: string;
    role: UserRole;
    siteIds?: string[];
  },
): Promise<string> {
  const passwordHash = await argon2.hash(opts.password);
  const user = await prisma.user.create({
    data: {
      accountId: opts.accountId,
      name: opts.name,
      phone: opts.phone,
      passwordHash,
      role: opts.role,
      sites: { create: (opts.siteIds ?? []).map((siteId) => ({ siteId })) },
    },
  });
  return user.id;
}
