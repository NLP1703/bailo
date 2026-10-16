import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthTokens, UserRole } from '@bailo/shared';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { durationToMs } from '../../common/time/duration';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Contenu du JWT d'accès. */
export interface AccessTokenPayload {
  sub: string; // user.id
  accountId: string;
  role: UserRole;
}

interface UserForToken {
  id: string;
  accountId: string;
  role: UserRole;
}

/** Empreinte déterministe d'un refresh token opaque (recherche par égalité en base). */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /** Émet un couple access + refresh et persiste l'empreinte du refresh. */
  async issue(user: UserForToken): Promise<AuthTokens> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      accountId: user.accountId,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL,
    });

    const rawRefresh = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + durationToMs(this.env.JWT_REFRESH_TTL));
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hashToken(rawRefresh), expiresAt },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: Math.floor(durationToMs(this.env.JWT_ACCESS_TTL) / 1000),
    };
  }

  /** Vérifie un JWT d'accès. Renvoie null si invalide/expiré (pas d'exception). */
  verifyAccess(token: string): AccessTokenPayload | null {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
    } catch {
      return null;
    }
  }

  /**
   * Rotation : valide le refresh présenté, le révoque et en émet un nouveau (RG NF6).
   * Un token révoqué ou expiré est rejeté.
   */
  async rotate(rawRefresh: string): Promise<AuthTokens> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawRefresh) },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expirée, reconnexion requise');
    }
    if (!record.user.active) {
      throw new UnauthorizedException('Compte utilisateur désactivé');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issue({
      id: record.user.id,
      accountId: record.user.accountId,
      role: record.user.role,
    });
  }

  /** Révoque un refresh (déconnexion). Silencieux si déjà inconnu/révoqué. */
  async revoke(rawRefresh: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefresh), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Révoque tous les refresh d'un utilisateur (reset de mot de passe). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
