import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { OtpPurpose } from '@bailo/shared';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MAIL_PROVIDER, type MailProvider } from '../mail/mail.provider';
import { passwordResetMail } from '../mail/mail.templates';

/**
 * Codes de vérification à 6 chiffres. Le code est **rattaché au téléphone** de
 * l'utilisateur (identifiant stable, clé de la table `otp_code`) et **envoyé par
 * e-mail** à son adresse.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /**
   * Génère un code, en stocke l'empreinte (argon2) et l'envoie à `email`.
   * Les codes précédents non consommés du même (téléphone, usage) sont invalidés
   * pour qu'un seul soit valide à la fois.
   */
  async request(target: { phone: string; email: string }, purpose: OtpPurpose): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + this.env.OTP_TTL_SECONDS * 1000);

    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: { phone: target.phone, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({ data: { phone: target.phone, purpose, codeHash, expiresAt } }),
    ]);

    await this.mail.send(passwordResetMail(target.email, code, this.env.OTP_TTL_SECONDS));
  }

  /**
   * Vérifie un code et le consomme si valide. Incrémente le compteur de tentatives
   * et bloque au-delà de OTP_MAX_ATTEMPTS (NF6). Renvoie true si consommé.
   */
  async verifyAndConsume(phone: string, purpose: OtpPurpose, code: string): Promise<boolean> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= this.env.OTP_MAX_ATTEMPTS) {
      return false;
    }

    const valid = await argon2.verify(otp.codeHash, code);
    if (!valid) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
    return true;
  }
}
