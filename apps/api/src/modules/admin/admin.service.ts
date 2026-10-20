import { Injectable } from '@nestjs/common';
import type { AdminOverview } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../../common/billing/billing.service';
import type { RequestContext } from '../../common/tenancy/request-context';

/**
 * Service d'orchestration pour les écrans Admin.
 *
 * LOT 0 : vue d'ensemble minimale (compte + rôle + indicateurs de base).
 * LOT 1 : enrichira avec dernières connexions, jauges de quota détaillées,
 *         actions sensibles récentes avec contexte.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  async overview(ctx: RequestContext): Promise<AdminOverview> {
    const since = new Date(Date.now() - 7 * 86_400_000);

    const [account, usersActive, usersInactive, anomaliesOpen, sensitiveActions, readOnly] =
      await Promise.all([
        this.prisma.account.findUnique({
          where: { id: ctx.accountId },
          select: { plan: true, subscriptionEndAt: true },
        }),
        this.prisma.user.count({ where: { accountId: ctx.accountId, active: true } }),
        this.prisma.user.count({ where: { accountId: ctx.accountId, active: false } }),
        this.prisma.anomaly.count({
          where: { accountId: ctx.accountId, resolvedAt: null },
        }),
        this.prisma.auditLog.count({
          where: {
            accountId: ctx.accountId,
            createdAt: { gte: since },
            action: { in: ['VOID', 'DELETE', 'ARCHIVE'] },
          },
        }),
        this.billing.isReadOnly(ctx.accountId),
      ]);

    return {
      accountId: ctx.accountId,
      role: ctx.role,
      readOnly,
      users: {
        active: usersActive,
        inactive: usersInactive,
        total: usersActive + usersInactive,
      },
      anomaliesOpen,
      sensitiveActionsLast7Days: sensitiveActions,
      plan: {
        code: account?.plan ?? 'DISCOVERY',
        endsAt: account?.subscriptionEndAt ? account.subscriptionEndAt.toISOString() : null,
      },
    };
  }
}
