import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@prisma/client';
import type {
  AuditEntryView,
  AuditFiltersQuery,
  AuditListResult,
  UserRole,
} from '@bailo/shared';
import { SENSITIVE_AUDIT_ACTIONS } from '@bailo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SiteAccessService } from '../../../common/tenancy/site-access.service';
import type { RequestContext } from '../../../common/tenancy/request-context';

/**
 * Admin → Journal d'audit (Lot 3).
 *
 * Lecture seule : aucune route n'écrit ni ne supprime. Chaque write Admin
 * passe par AuditService.log — ce service se contente de les relire avec
 * filtres et pagination par curseur.
 *
 * Portée des rôles :
 *   OWNER   : voit toutes les lignes du compte.
 *   MANAGER : voit uniquement les lignes de ses sites assignés PLUS les lignes
 *             sans siteId (compat ascendante : l'historique antérieur au Lot 3
 *             n'a pas de siteId, on ne masque pas rétroactivement).
 */

const SENSITIVE_SET: AuditAction[] = SENSITIVE_AUDIT_ACTIONS;

function isUserRoleChange(entity: string, action: AuditAction, before: unknown, after: unknown): boolean {
  if (entity !== 'user' || action !== 'UPDATE') return false;
  const b = (before as { role?: string } | null)?.role;
  const a = (after as { role?: string } | null)?.role;
  return !!a && !!b && a !== b;
}

function sensitive(entity: string, action: AuditAction, before: unknown, after: unknown): boolean {
  return SENSITIVE_SET.includes(action) || isUserRoleChange(entity, action, before, after);
}

@Injectable()
export class AdminAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteAccess: SiteAccessService,
  ) {}

  /** Where Prisma commun aux routes list et export. Scope + filtres utilisateur. */
  private async buildWhere(
    ctx: RequestContext,
    q: AuditFiltersQuery,
  ): Promise<Prisma.AuditLogWhereInput> {
    const scope = await this.siteAccess.accessibleSiteIds(ctx);
    const where: Prisma.AuditLogWhereInput = { accountId: ctx.accountId };

    if (scope !== 'ALL') {
      // MANAGER : ses sites OU lignes « globales » (siteId NULL).
      where.OR = [{ siteId: { in: scope } }, { siteId: null }];
    }
    if (q.from) where.createdAt = { ...(where.createdAt as object | undefined), gte: new Date(q.from) };
    if (q.to) where.createdAt = { ...(where.createdAt as object | undefined), lte: new Date(q.to) };
    if (q.actorId) where.actorId = q.actorId;
    if (q.entity) where.entity = q.entity;
    if (q.entityId) where.entityId = q.entityId;
    if (q.action) where.action = q.action;
    if (q.sensitiveOnly) {
      // SQL grossier (VOID/DELETE/ARCHIVE OU UPDATE user) ; le filtre fin
      // « changement de rôle » est appliqué en mémoire après tirage.
      const sensitiveClause: Prisma.AuditLogWhereInput = {
        OR: [
          { action: { in: SENSITIVE_SET } },
          { entity: 'user', action: 'UPDATE' },
        ],
      };
      where.AND = where.AND
        ? Array.isArray(where.AND)
          ? [...where.AND, sensitiveClause]
          : [where.AND, sensitiveClause]
        : [sensitiveClause];
    }
    return where;
  }

  async list(ctx: RequestContext, q: AuditFiltersQuery): Promise<AuditListResult> {
    const where = await this.buildWhere(ctx, q);

    const cursorWhere: Prisma.AuditLogWhereInput = q.before
      ? { AND: [where, { createdAt: { lt: new Date(q.before) } }] }
      : where;

    // Si sensitiveOnly, on tire 1.5× pageSize pour compenser le filtre fin en
    // mémoire (UPDATE user sans changement de rôle). Jamais plus de 200 lignes.
    const take = Math.min(200, q.sensitiveOnly ? Math.ceil(q.pageSize * 1.5) : q.pageSize);

    const rows = await this.prisma.auditLog.findMany({
      where: cursorWhere,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        actorId: true,
        entity: true,
        entityId: true,
        siteId: true,
        action: true,
        reason: true,
        before: true,
        after: true,
      },
    });

    const refined = q.sensitiveOnly
      ? rows.filter((l) => sensitive(l.entity, l.action, l.before, l.after))
      : rows;
    const page = refined.slice(0, q.pageSize);

    // Hydratation des noms d'acteurs (une seule query — pas de N+1).
    const actorIds = Array.from(new Set(page.map((l) => l.actorId)));
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const name = new Map(actors.map((u) => [u.id, u.name]));

    const items: AuditEntryView[] = page.map((l) => ({
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      actorId: l.actorId,
      actorName: name.get(l.actorId) ?? null,
      entity: l.entity,
      entityId: l.entityId,
      siteId: l.siteId,
      action: l.action,
      reason: l.reason,
      sensitive: sensitive(l.entity, l.action, l.before, l.after),
      isRoleChange: isUserRoleChange(l.entity, l.action, l.before, l.after),
      before: l.before,
      after: l.after,
    }));

    const nextCursor =
      page.length === q.pageSize ? page[page.length - 1]!.createdAt.toISOString() : null;
    return { items, nextCursor };
  }

  /**
   * Export CSV (UTF-8 BOM + séparateur `;`) — même conventions que l'export
   * OHADA. Streamé par pages de 500 lignes pour éviter de charger tout le
   * journal en mémoire. Respecte filtres et portée du rôle.
   *
   * Renvoie une string complète pour simplifier le contrat du contrôleur ;
   * si le volume devient très grand (> 50k lignes), on passera à un vrai flux
   * `Readable` plus tard.
   */
  async exportCsv(ctx: RequestContext, q: AuditFiltersQuery): Promise<string> {
    const header = [
      'Date',
      'Acteur',
      'ActorID',
      'Entité',
      'EntityID',
      'Site',
      'Action',
      'Sensible',
      'Changement de rôle',
      'Motif',
    ];
    const rows: string[] = [header.join(';')];

    const PAGE = 500;
    let cursor: string | undefined = q.before;
    for (;;) {
      const batch = await this.list(ctx, { ...q, before: cursor, pageSize: PAGE });
      // Noms de site hydratés par lot pour éviter le N+1.
      const siteIds = Array.from(
        new Set(batch.items.map((i) => i.siteId).filter((v): v is string => !!v)),
      );
      const sites = siteIds.length
        ? await this.prisma.site.findMany({
            where: { id: { in: siteIds } },
            select: { id: true, name: true },
          })
        : [];
      const siteName = new Map(sites.map((s) => [s.id, s.name]));

      for (const e of batch.items) {
        rows.push(
          [
            e.createdAt,
            csvEscape(e.actorName ?? ''),
            e.actorId,
            e.entity,
            e.entityId,
            csvEscape(e.siteId ? (siteName.get(e.siteId) ?? e.siteId) : ''),
            e.action,
            e.sensitive ? 'oui' : 'non',
            e.isRoleChange ? 'oui' : 'non',
            csvEscape(e.reason ?? ''),
          ].join(';'),
        );
      }
      if (!batch.nextCursor || batch.items.length < PAGE) break;
      cursor = batch.nextCursor;
    }

    return '﻿' + rows.join('\r\n');
  }

  /** Simple sanity check pour les tests : nombre total après portée + filtres. */
  async countForTests(ctx: RequestContext, q: AuditFiltersQuery): Promise<number> {
    const where = await this.buildWhere(ctx, q);
    return this.prisma.auditLog.count({ where });
  }
}

/** Protection CSV : guillemets doubles autour si séparateur / saut de ligne / guillemet, échappement RFC-4180. */
function csvEscape(v: string): string {
  if (/[;\r\n"]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

// Export d'un helper utile pour les e2e qui veulent asserter la portée MANAGER.
export const __rolesWhoCanSeeAll: UserRole[] = ['OWNER'];
