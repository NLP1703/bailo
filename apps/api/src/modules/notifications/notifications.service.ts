import { Injectable, Logger } from '@nestjs/common';
import type { UserRole } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Notifications push (Expo Push Service → FCM/APNs). L'envoi est toujours « best-effort » :
 * il n'interrompt jamais l'action métier qui l'a déclenché (NFM5). Les jetons sont stockés
 * sur l'appareil (device.pushToken) à l'enregistrement.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Jetons push actifs des membres d'un compte ayant l'un des rôles donnés. */
  async tokensForRoles(accountId: string, roles: readonly UserRole[]): Promise<string[]> {
    const rows = await this.prisma.device.findMany({
      where: {
        accountId,
        revokedAt: null,
        pushToken: { not: null },
        user: { role: { in: [...roles] } },
      },
      select: { pushToken: true },
    });
    return [...new Set(rows.map((r) => r.pushToken).filter((t): t is string => Boolean(t)))];
  }

  /** Notifie les membres d'un compte par rôle, sans jamais lever (l'appelant n'attend rien). */
  async notifyRoles(accountId: string, roles: readonly UserRole[], message: PushMessage): Promise<void> {
    try {
      const tokens = await this.tokensForRoles(accountId, roles);
      await this.push(tokens, message);
    } catch (error) {
      this.logger.warn(`Notification non envoyée : ${(error as Error).message}`);
    }
  }

  /** Dépôt au service Expo. Neutralisé en test (aucun appel réseau). */
  private async push(tokens: string[], message: PushMessage): Promise<void> {
    if (tokens.length === 0 || process.env.NODE_ENV === 'test') return;
    const messages = tokens.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      sound: 'default',
      ...(message.data ? { data: message.data } : {}),
    }));
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) throw new Error(`Expo push a répondu ${res.status}`);
  }
}
