import { Injectable } from '@nestjs/common';
import type {
  AdminOverview,
  AdminQuotaGauge,
  AdminRecentLogin,
  AdminSensitiveAction,
  AdminOpenAnomaly,
  UserRole,
  SubscriptionPlan,
} from '@bailo/shared';
import type { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../../common/billing/billing.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import type { RequestContext } from '../../common/tenancy/request-context';

/**
 * Service d'orchestration pour les écrans Admin.
 *
 * LOT 1 : vue d'ensemble enrichie.
 *   - Jauges de quota (sites / unités / utilisateurs) basées sur un barème
 *     en code (helper plus bas) — à remplacer par la table `PlanLimit` au LOT 5.
 *   - Liste des 5 dernières connexions (nouveau champ `User.lastLoginAt`).
 *   - 5 actions sensibles récentes (VOID / DELETE / ARCHIVE + changement de
 *     rôle détecté sur UPDATE user).
 *   - 5 anomalies ouvertes triées par sévérité puis récence.
 *   - Filtre MANAGER : les anomalies sont restreintes à ses sites assignés via
 *     `SiteAccessService`. Les actions sensibles ne portent pas de siteId sur
 *     la plupart des entités (payment, charge…), on les garde donc au niveau
 *     du compte — la restriction fine viendra avec `AuditLog.siteId` si besoin.
 *
 * Performance : toutes les requêtes sont lancées en parallèle via `Promise.all`,
 * sans N+1. Objectif < 1 s sur le jeu de données de démo.
 */

/**
 * Barème des quotas par plan — valeurs du cahier des charges (DISCOVERY = 5 unités).
 * TEMPORAIRE : sera lu depuis la table `PlanLimit` au LOT 5 (abonnement/quotas).
 * `null` = pas de limite.
 */
const PLAN_LIMITS: Record<SubscriptionPlan, { sites: number | null; units: number | null; users: number | null }> = {
  DISCOVERY: { sites: 1, units: 5, users: 2 },
  CITE: { sites: 1, units: 50, users: 5 },
  CITE_PRO: { sites: 5, units: 300, users: 20 },
  MANAGER: { sites: null, units: null, users: null },
};

function gauge(used: number, limit: number | null): AdminQuotaGauge {
  if (limit === null) return { used, limit: null, pct: null };
  const pct = limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return { used, limit, pct };
}

/** Vrai si un UPDATE sur `user` fait varier le rôle (regardant before/after). */
function isUserRoleChange(entity: string, action: AuditAction, before: unknown, after: unknown): boolean {
  if (entity !== 'user' || action !== 'UPDATE') return false;
  const b = (before as { role?: string } | null)?.role;
  const a = (after as { role?: string } | null)?.role;
  return !!a && !!b && a !== b;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly siteAccess: SiteAccessService,
  ) {}

  async overview(ctx: RequestContext): Promise<AdminOverview> {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const SENSITIVE: AuditAction[] = ['VOID', 'DELETE', 'ARCHIVE'];

    // Portée des anomalies : MANAGER restreint à ses sites assignés.
    // Si le manager n'est assigné à aucun site, on force un filtre vide.
    const scope = await this.siteAccess.accessibleSiteIds(ctx);
    const anomalyScope: Prisma.AnomalyWhereInput =
      scope === 'ALL'
        ? {}
        : scope.length === 0
          ? { id: '__none__' } // aucun résultat (jamais matché par UUID bidon)
          : { siteId: { in: scope } };

    const [
      account,
      usersActive,
      usersInactive,
      sitesCount,
      unitsCount,
      usersCountAll,
      anomaliesOpenCount,
      sensitiveCountRaw,
      recentLoginsRows,
      sensitiveRaw,
      openAnomaliesRows,
      readOnly,
    ] = await Promise.all([
      this.prisma.account.findUnique({
        where: { id: ctx.accountId },
        select: { plan: true, subscriptionEndAt: true },
      }),
      this.prisma.user.count({ where: { accountId: ctx.accountId, active: true } }),
      this.prisma.user.count({ where: { accountId: ctx.accountId, active: false } }),
      this.prisma.site.count({ where: { accountId: ctx.accountId } }),
      this.prisma.unit.count({ where: { accountId: ctx.accountId } }),
      this.prisma.user.count({ where: { accountId: ctx.accountId } }),
      this.prisma.anomaly.count({
        where: { accountId: ctx.accountId, resolvedAt: null, ...anomalyScope },
      }),
      // Compteur SQL approximatif (inclut aussi les UPDATE user qui ne
      // changent pas le rôle). On ajuste finement plus bas sur les 20 lignes
      // tirées — le compteur devient alors exact pour ≤ 20 actions ; au-delà,
      // on garde cette borne supérieure, acceptable pour une vue d'ensemble.
      this.prisma.auditLog.count({
        where: {
          accountId: ctx.accountId,
          createdAt: { gte: since },
          OR: [{ action: { in: SENSITIVE } }, { entity: 'user', action: 'UPDATE' }],
        },
      }),
      this.prisma.user.findMany({
        where: { accountId: ctx.accountId, lastLoginAt: { not: null } },
        orderBy: { lastLoginAt: 'desc' },
        take: 5,
        select: { id: true, name: true, role: true, lastLoginAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          accountId: ctx.accountId,
          createdAt: { gte: since },
          OR: [{ action: { in: SENSITIVE } }, { entity: 'user', action: 'UPDATE' }],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          actorId: true,
          entity: true,
          entityId: true,
          action: true,
          before: true,
          after: true,
        },
      }),
      this.prisma.anomaly.findMany({
        where: { accountId: ctx.accountId, resolvedAt: null, ...anomalyScope },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        select: { id: true, kind: true, severity: true, message: true, siteId: true, createdAt: true },
      }),
      this.billing.isReadOnly(ctx.accountId),
    ]);

    // Hydrate les noms d'acteurs en un seul find pour éviter le N+1.
    const actorIds = Array.from(new Set(sensitiveRaw.map((l) => l.actorId)));
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const actorName = new Map(actors.map((u) => [u.id, u.name]));

    // Filtre fin : les UPDATE user ne « comptent » que si le rôle a changé.
    const kept = sensitiveRaw.filter(
      (l) =>
        SENSITIVE.includes(l.action) ||
        isUserRoleChange(l.entity, l.action, l.before, l.after),
    );
    const refinedSensitive: AdminSensitiveAction[] = kept.slice(0, 5).map((l) => ({
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      actorName: actorName.get(l.actorId) ?? null,
      entity: l.entity,
      entityId: l.entityId,
      action: l.action,
      isRoleChange: isUserRoleChange(l.entity, l.action, l.before, l.after),
    }));

    // Comptage précis : si le set brut tient dans la fenêtre de 20 lignes, on
    // connaît le vrai compte ; sinon on garde la borne supérieure SQL.
    const sensitiveActionsLast7Days =
      sensitiveRaw.length < 20 ? kept.length : sensitiveCountRaw;

    const planCode = (account?.plan ?? 'DISCOVERY') as SubscriptionPlan;
    const limits = PLAN_LIMITS[planCode] ?? PLAN_LIMITS.DISCOVERY;

    const recentLogins: AdminRecentLogin[] = recentLoginsRows.map((u) => ({
      userId: u.id,
      name: u.name,
      role: u.role as UserRole,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    }));

    const openAnomalies: AdminOpenAnomaly[] = openAnomaliesRows.map((a) => ({
      id: a.id,
      kind: a.kind,
      severity: a.severity,
      message: a.message,
      siteId: a.siteId,
      createdAt: a.createdAt.toISOString(),
    }));

    return {
      accountId: ctx.accountId,
      role: ctx.role,
      readOnly,
      users: {
        active: usersActive,
        inactive: usersInactive,
        total: usersActive + usersInactive,
      },
      anomaliesOpen: anomaliesOpenCount,
      sensitiveActionsLast7Days,
      plan: {
        code: planCode,
        endsAt: account?.subscriptionEndAt ? account.subscriptionEndAt.toISOString() : null,
      },
      quotas: {
        sites: gauge(sitesCount, limits.sites),
        units: gauge(unitsCount, limits.units),
        users: gauge(usersCountAll, limits.users),
      },
      recentLogins,
      recentSensitiveActions: refinedSensitive,
      openAnomalies,
    };
  }
}
