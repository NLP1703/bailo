import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type {
  AuthTokens,
  LoginDto,
  PasswordResetDto,
  RequestOtpDto,
  SignupDto,
} from '@citegest/shared';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

/** Fenêtre glissante d'anti-force-brute sur la connexion (par téléphone). */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<string, { count: number; firstAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async requestOtp(dto: RequestOtpDto): Promise<void> {
    // Pour SIGNUP, on refuse un téléphone déjà titulaire d'un compte.
    if (dto.purpose === 'SIGNUP') {
      const existing = await this.prisma.account.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        throw new ConflictException('Ce numéro est déjà associé à un compte');
      }
    }
    await this.otp.request(dto.phone, dto.purpose);
  }

  /** Crée le compte + son propriétaire après validation de l'OTP. */
  async signup(dto: SignupDto): Promise<AuthTokens> {
    const ok = await this.otp.verifyAndConsume(dto.phone, 'SIGNUP', dto.otp);
    if (!ok) {
      throw new UnauthorizedException('Code de vérification invalide ou expiré');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma
      .$transaction(async (tx) => {
        const account = await tx.account.create({
          data: { name: dto.accountName, phone: dto.phone },
        });
        return tx.user.create({
          data: {
            accountId: account.id,
            name: dto.ownerName,
            phone: dto.phone,
            passwordHash,
            role: 'OWNER',
          },
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Object && 'code' in error && error.code === 'P2002') {
          throw new ConflictException('Ce numéro est déjà associé à un compte');
        }
        throw error;
      });

    return this.tokens.issue({ id: user.id, accountId: user.accountId, role: user.role });
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    this.assertNotRateLimited(dto.phone);

    // Un même numéro peut exister dans plusieurs comptes (ex. gardien) : on
    // authentifie contre chaque candidat actif, le premier dont le mot de passe
    // correspond l'emporte (résolution mono-compte au MVP).
    const candidates = await this.prisma.user.findMany({
      where: { phone: dto.phone, active: true },
    });
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.passwordHash, dto.password)) {
        this.loginAttempts.delete(dto.phone);
        return this.tokens.issue({
          id: candidate.id,
          accountId: candidate.accountId,
          role: candidate.role,
        });
      }
    }

    this.registerFailedAttempt(dto.phone);
    throw new UnauthorizedException('Téléphone ou mot de passe incorrect');
  }

  async refresh(rawRefresh: string): Promise<AuthTokens> {
    return this.tokens.rotate(rawRefresh);
  }

  async resetPassword(dto: PasswordResetDto): Promise<void> {
    const ok = await this.otp.verifyAndConsume(dto.phone, 'PASSWORD_RESET', dto.otp);
    if (!ok) {
      throw new UnauthorizedException('Code de vérification invalide ou expiré');
    }
    const passwordHash = await argon2.hash(dto.newPassword);
    const users = await this.prisma.user.findMany({ where: { phone: dto.phone } });
    for (const user of users) {
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      await this.tokens.revokeAllForUser(user.id);
    }
  }

  async logout(rawRefresh: string): Promise<void> {
    await this.tokens.revoke(rawRefresh);
  }

  // ─── Anti-force-brute (NF6) ────────────────────────────────────────────────

  private assertNotRateLimited(phone: string): void {
    const entry = this.loginAttempts.get(phone);
    if (!entry) return;
    if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
      this.loginAttempts.delete(phone);
      return;
    }
    if (entry.count >= this.env.LOGIN_MAX_ATTEMPTS) {
      throw new HttpException(
        'Trop de tentatives, réessayez plus tard',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private registerFailedAttempt(phone: string): void {
    const entry = this.loginAttempts.get(phone);
    if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
      this.loginAttempts.set(phone, { count: 1, firstAt: Date.now() });
    } else {
      entry.count += 1;
    }
  }
}
