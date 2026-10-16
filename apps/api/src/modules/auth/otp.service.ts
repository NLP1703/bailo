import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { OtpPurpose } from '@bailo/shared';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /**
   * Génère un code à 6 chiffres, en stocke l'empreinte (argon2) et l'envoie.
   * On invalide les codes précédents non consommés du même (téléphone, usage)
   * pour qu'un seul soit valide à la fois.
   */
  async request(phone: string, purpose: OtpPurpose): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + this.env.OTP_TTL_SECONDS * 1000);

    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: { phone, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({ data: { phone, purpose, codeHash, expiresAt } }),
    ]);

    await this.sms.send(phone, `Bailo : votre code de vérification est ${code}`);
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
