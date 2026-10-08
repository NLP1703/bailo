import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from './request-context';

/**
 * Restriction d'accès par site (matrice §2.1) :
 *  - OWNER  : tous les sites de son compte ;
 *  - MANAGER / CARETAKER : uniquement les sites qui leur sont assignés (user_site).
 *
 * Le cloisonnement par compte (accountId) est déjà garanti en amont ; ici on
 * affine au périmètre des sites autorisés.
 */
@Injectable()
export class SiteAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liste des sites autorisés, ou `'ALL'` pour un propriétaire. */
  async accessibleSiteIds(ctx: RequestContext): Promise<string[] | 'ALL'> {
    if (ctx.role === 'OWNER') return 'ALL';
    const links = await this.prisma.userSite.findMany({
      where: { userId: ctx.userId },
      select: { siteId: true },
    });
    return links.map((link) => link.siteId);
  }

  /** Filtre Prisma `where` sur `site.id` selon le périmètre autorisé. */
  async siteIdFilter(ctx: RequestContext): Promise<Record<string, unknown>> {
    const ids = await this.accessibleSiteIds(ctx);
    return ids === 'ALL' ? {} : { id: { in: ids } };
  }

  /** Vérifie l'accès à un site précis, lève 403 sinon. */
  async assertSiteAccess(ctx: RequestContext, siteId: string): Promise<void> {
    if (ctx.role === 'OWNER') return;
    const link = await this.prisma.userSite.findUnique({
      where: { userId_siteId: { userId: ctx.userId, siteId } },
    });
    if (!link) {
      throw new ForbiddenException("Vous n'avez pas accès à ce site");
    }
  }
}
