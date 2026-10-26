import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type {
  AuthTokens,
  LoginDto,
  PasswordResetDto,
  RequestOtpDto,
  SignupDto,
} from '@bailo/shared';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { AppException } from '../../common/http/app.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RateLimiterService } from '../../common/redis/rate-limiter.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

/** Fenêtre glissante d'anti-force-brute sur la connexion (par téléphone/email). */
const LOGIN_WINDOW_SEC = 15 * 60;
/** Demandes de code « mot de passe oublié » : 3 par identifiant et par quart d'heure. */
const OTP_REQUEST_MAX = 3;
const OTP_REQUEST_WINDOW_SEC = 15 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly rateLimiter: RateLimiterService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /**
   * Mot de passe oublié : envoie un code à l'e-mail du compte désigné par son
   * e-mail ou son téléphone. La réponse est identique que le compte existe ou non
   * (pas d'énumération des comptes) ; sans adresse e-mail connue, rien n'est envoyé.
   */
  async requestOtp(dto: RequestOtpDto): Promise<void> {
    const identifier = dto.email ?? dto.phone!;
    const limit = await this.rateLimiter.hit(
      `otp:${identifier}`,
      OTP_REQUEST_MAX,
      OTP_REQUEST_WINDOW_SEC,
    );
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAtMs - Date.now()) / 1000));
      throw AppException.tooMany('OTP_RATE_LIMITED', retryAfter);
    }

    const user = await this.prisma.user.findFirst({
      where: {
        active: true,
        email: dto.email ? dto.email : { not: null },
        ...(dto.phone && !dto.email ? { phone: dto.phone } : {}),
      },
      orderBy: { lastLoginAt: { sort: 'desc', nulls: 'last' } },
      select: { phone: true, email: true },
    });
    if (!user?.email) return;
    await this.otp.request({ phone: user.phone, email: user.email }, dto.purpose);
  }

  /** Crée le compte + son propriétaire (inscription directe, sans OTP). */
  async signup(dto: SignupDto): Promise<AuthTokens> {
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma
      .$transaction(async (tx) => {
        // À l'inscription, le compte démarre sur l'offre Découverte : 1 cité et
        // 5 logements maximum, sans engagement ni carte bancaire. Le passage à
        // une offre payante se fait depuis l'onglet « Offres ».
        const account = await tx.account.create({
          data: {
            name: dto.accountName,
            phone: dto.phone,
            plan: 'DISCOVERY',
            subscriptionEndAt: null,
          },
        });
        return tx.user.create({
          data: {
            accountId: account.id,
            name: dto.ownerName,
            email: dto.email,
            phone: dto.phone,
            passwordHash,
            role: 'OWNER',
          },
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Object && 'code' in error && error.code === 'P2002') {
          const target = String((error as { meta?: { target?: unknown } }).meta?.target ?? '');
          throw AppException.conflict(
            target.includes('email') ? 'AUTH_EMAIL_ALREADY_USED' : 'AUTH_PHONE_ALREADY_USED',
          );
        }
        throw error;
      });

    return this.tokens.issue({ id: user.id, accountId: user.accountId, role: user.role });
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const key = `login:${dto.email ?? dto.phone!}`;
    const result = await this.rateLimiter.hit(key, this.env.LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SEC);
    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAtMs - Date.now()) / 1000));
      throw AppException.tooMany('LOGIN_RATE_LIMITED', retryAfter);
    }

    const candidates = await this.prisma.user.findMany({
      where: dto.email
        ? { email: dto.email, active: true }
        : { phone: dto.phone!, active: true },
    });
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.passwordHash, dto.password)) {
        await this.rateLimiter.reset(key);
        // Horodate la connexion pour la vue d'ensemble Admin (Lot 1) et le
        // futur suivi d'inactivité. En arrière-plan : jamais bloquant pour le
        // login — un échec de l'UPDATE est ignoré silencieusement.
        void this.prisma.user
          .update({ where: { id: candidate.id }, data: { lastLoginAt: new Date() } })
          .catch(() => undefined);
        return this.tokens.issue({
          id: candidate.id,
          accountId: candidate.accountId,
          role: candidate.role,
        });
      }
    }

    throw new AppException('AUTH_INVALID_CREDENTIALS', 401);
  }

  async refresh(rawRefresh: string): Promise<AuthTokens> {
    return this.tokens.rotate(rawRefresh);
  }

  async resetPassword(dto: PasswordResetDto): Promise<void> {
    // Le code est rattaché au téléphone du compte : on le retrouve depuis l'e-mail si besoin.
    const phone = dto.email
      ? (await this.prisma.user.findUnique({ where: { email: dto.email }, select: { phone: true } }))
          ?.phone
      : dto.phone;
    const ok = phone ? await this.otp.verifyAndConsume(phone, 'PASSWORD_RESET', dto.otp) : false;
    if (!ok || !phone) {
      throw new AppException('AUTH_OTP_INVALID', 401);
    }
    const passwordHash = await argon2.hash(dto.newPassword);
    const users = await this.prisma.user.findMany({ where: { phone } });
    for (const user of users) {
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      await this.tokens.revokeAllForUser(user.id);
    }
  }

  async logout(rawRefresh: string): Promise<void> {
    await this.tokens.revoke(rawRefresh);
  }
}
