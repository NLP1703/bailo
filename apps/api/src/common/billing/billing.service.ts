import { Injectable } from '@nestjs/common';
import {
  PLAN_LIMITS,
  TRIAL_DAYS,
  isAccountReadOnly,
  type BillingSummary,
  type SubscriptionPlan,
} from '@bailo/shared';
import { AppException } from '../http/app.exception';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;

/**
 * Règles d'abonnement (M9) : limites par offre, lecture seule après échéance,
 * changement d'offre. Le paiement Mobile Money réel viendra en V2 ; ici un
 * changement d'offre payante crédite un mois (stand-in manuel).
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Échéance d'essai Cité Pro à l'inscription (utilisée par l'auth). */
  trialEnd(from: Date = new Date()): Date {
    return new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
  }

  async isReadOnly(accountId: string): Promise<boolean> {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { plan: true, subscriptionEndAt: true },
    });
    if (!acc) return false;
    return isAccountReadOnly(acc.plan, acc.subscriptionEndAt);
  }

  /** Vérifie que l'ajout de `add` unités ne dépasse pas la limite de l'offre. */
  async assertUnitQuota(accountId: string, add: number): Promise<void> {
    const { plan } = await this.planOf(accountId);
    const limit = PLAN_LIMITS[plan].maxUnits;
    if (limit === null) return;
    const count = await this.prisma.unit.count({ where: { accountId } });
    if (count + add > limit) {
      throw AppException.paymentRequired('UNIT_QUOTA_EXCEEDED', { limit, current: count });
    }
  }

  /** Vérifie que l'ajout de `add` utilisateurs ne dépasse pas la limite de l'offre. */
  async assertUserQuota(accountId: string, add: number): Promise<void> {
    const { plan } = await this.planOf(accountId);
    const limit = PLAN_LIMITS[plan].maxUsers;
    if (limit === null) return;
    const count = await this.prisma.user.count({ where: { accountId } });
    if (count + add > limit) {
      throw AppException.paymentRequired('USER_QUOTA_EXCEEDED', { limit, current: count });
    }
  }

  /** Vérifie que l'ajout de `add` cités / immeubles ne dépasse pas la limite de l'offre. */
  async assertSiteQuota(accountId: string, add: number): Promise<void> {
    const { plan } = await this.planOf(accountId);
    const limit = PLAN_LIMITS[plan].maxSites;
    if (limit === null) return;
    const count = await this.prisma.site.count({ where: { accountId } });
    if (count + add > limit) {
      throw AppException.paymentRequired('SITE_QUOTA_EXCEEDED', { limit, current: count });
    }
  }

  async summary(accountId: string): Promise<BillingSummary> {
    const acc = await this.planOf(accountId);
    const [sites, units, users] = await Promise.all([
      this.prisma.site.count({ where: { accountId } }),
      this.prisma.unit.count({ where: { accountId } }),
      this.prisma.user.count({ where: { accountId } }),
    ]);
    const l = PLAN_LIMITS[acc.plan];
    return {
      plan: acc.plan,
      subscriptionEndAt: acc.subscriptionEndAt ? acc.subscriptionEndAt.toISOString() : null,
      readOnly: isAccountReadOnly(acc.plan, acc.subscriptionEndAt),
      limits: {
        maxSites: l.maxSites,
        maxUnits: l.maxUnits,
        maxUsers: l.maxUsers,
        pricePerUnit: l.pricePerUnit,
        pricePerMonth: l.pricePerMonth,
        pricePerYear: l.pricePerYear,
      },
      usage: { sites, units, users },
    };
  }

  /**
   * Change l'offre du compte. Découverte = gratuit (sans échéance) ; une offre
   * payante crédite un mois d'accès (en attendant le paiement Mobile Money réel).
   */
  async changePlan(accountId: string, plan: SubscriptionPlan): Promise<BillingSummary> {
    const subscriptionEndAt =
      plan === 'DISCOVERY' ? null : new Date(Date.now() + 30 * DAY_MS);
    await this.prisma.account.update({ where: { id: accountId }, data: { plan, subscriptionEndAt } });
    return this.summary(accountId);
  }

  private async planOf(accountId: string): Promise<{
    plan: SubscriptionPlan;
    subscriptionEndAt: Date | null;
  }> {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { plan: true, subscriptionEndAt: true },
    });
    return { plan: acc?.plan ?? 'DISCOVERY', subscriptionEndAt: acc?.subscriptionEndAt ?? null };
  }
}
