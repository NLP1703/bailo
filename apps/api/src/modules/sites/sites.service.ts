import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateBlockDto,
  CreateSiteDto,
  OnboardingDto,
  UpdateSiteDto,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../../common/billing/billing.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import type { RequestContext } from '../../common/tenancy/request-context';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SiteAccessService,
    private readonly billing: BillingService,
  ) {}

  async create(ctx: RequestContext, dto: CreateSiteDto) {
    // Quota de l'offre : empêche p.ex. un compte Découverte d'avoir plus d'une cité.
    await this.billing.assertSiteQuota(ctx.accountId, 1);
    const site = await this.prisma.site.create({
      data: { ...dto, accountId: ctx.accountId },
    });
    // Un gérant qui crée un site s'y assigne pour en conserver l'accès.
    if (ctx.role !== 'OWNER') {
      await this.prisma.userSite.create({ data: { userId: ctx.userId, siteId: site.id } });
    }
    return site;
  }

  /**
   * Mise en service juste après l'inscription : crée le bâtiment et ses unités
   * (chambres, studios, maisons…) en une transaction. `furnished` s'applique à
   * toutes les unités ; chaque maison peut porter sa description (bedrooms, rooms).
   */
  async onboarding(ctx: RequestContext, dto: OnboardingDto) {
    const codes = dto.units.map((u) => u.code);
    const duplicates = codes.filter((c, i) => codes.indexOf(c) !== i);
    if (duplicates.length > 0) {
      throw new BadRequestException(`Codes en double : ${[...new Set(duplicates)].join(', ')}`);
    }
    await this.billing.assertSiteQuota(ctx.accountId, 1);
    await this.billing.assertUnitQuota(ctx.accountId, dto.units.length);

    const site = await this.prisma.$transaction(async (tx) => {
      const created = await tx.site.create({
        data: {
          accountId: ctx.accountId,
          name: dto.site.name,
          type: dto.site.type,
          city: dto.site.city,
          district: dto.site.district,
          createdBy: ctx.userId,
        },
      });
      if (ctx.role !== 'OWNER') {
        await tx.userSite.create({ data: { userId: ctx.userId, siteId: created.id } });
      }
      await tx.unit.createMany({
        data: dto.units.map((u) => ({
          accountId: ctx.accountId,
          siteId: created.id,
          code: u.code,
          type: u.type,
          baseRent: u.baseRent,
          furnished: dto.furnished,
          capacity: u.capacity,
          bedrooms: u.bedrooms ?? null,
          rooms: u.rooms,
          createdBy: ctx.userId,
        })),
      });
      return created;
    });

    return { site, unitCount: dto.units.length, hasExistingTenants: dto.hasExistingTenants };
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
