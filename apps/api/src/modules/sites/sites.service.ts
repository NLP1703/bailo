import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateBlockDto, CreateSiteDto, UpdateSiteDto } from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import type { RequestContext } from '../../common/tenancy/request-context';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SiteAccessService,
  ) {}

  async create(ctx: RequestContext, dto: CreateSiteDto) {
    const site = await this.prisma.site.create({
      data: { ...dto, accountId: ctx.accountId },
    });
    // Un gérant qui crée un site s'y assigne pour en conserver l'accès.
    if (ctx.role !== 'OWNER') {
      await this.prisma.userSite.create({ data: { userId: ctx.userId, siteId: site.id } });
    }
    return site;
  }

  async list(ctx: RequestContext) {
    const where = await this.access.siteIdFilter(ctx);
    return this.prisma.site.findMany({ where, orderBy: { createdAt: 'asc' } });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateSiteDto) {
    await this.getOwned(ctx, id);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async listBlocks(ctx: RequestContext, siteId: string) {
    await this.getOwned(ctx, siteId);
    return this.prisma.block.findMany({
      where: { siteId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createBlock(ctx: RequestContext, siteId: string, dto: CreateBlockDto) {
    await this.getOwned(ctx, siteId);
    return this.prisma.block.create({ data: { siteId, accountId: ctx.accountId, ...dto } });
  }

  /** Charge un site du compte accessible au contexte, ou lève 404/403. */
  private async getOwned(ctx: RequestContext, id: string) {
    const site = await this.prisma.site.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }
    await this.access.assertSiteAccess(ctx, id);
    return site;
  }
}
