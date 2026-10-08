import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  computeChargeStatus,
  computeUnitColor,
  diffDays,
  type BulkCreateUnitsDto,
  type CreateUnitDto,
  type ListUnitsQuery,
  type UnitColor,
  type UpdateUnitDto,
} from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import type { RequestContext } from '../../common/tenancy/request-context';

const MAX_BULK_UNITS = 500;

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SiteAccessService,
  ) {}

  async create(ctx: RequestContext, siteId: string, dto: CreateUnitDto) {
    await this.assertSite(ctx, siteId);
    if (dto.blockId) await this.assertBlockInSite(dto.blockId, siteId);
    return this.prisma.unit.create({ data: { siteId, accountId: ctx.accountId, ...dto } });
  }

  /** Création en série : « A01 à A24 à 25 000 FCFA ». */
  async bulkCreate(ctx: RequestContext, siteId: string, dto: BulkCreateUnitsDto) {
    await this.assertSite(ctx, siteId);
    if (dto.to < dto.from) {
      throw new BadRequestException('La borne de fin doit être ≥ la borne de début');
    }
    const count = dto.to - dto.from + 1;
    if (count > MAX_BULK_UNITS) {
      throw new BadRequestException(`Trop d'unités en une fois (max ${MAX_BULK_UNITS})`);
    }
    if (dto.blockId) await this.assertBlockInSite(dto.blockId, siteId);

    const codes: string[] = [];
    for (let n = dto.from; n <= dto.to; n += 1) {
      codes.push(`${dto.prefix}${String(n).padStart(dto.padding, '0')}`);
    }

    // Rejet clair si un code existe déjà sur ce site (plutôt qu'un skip silencieux).
    const clashes = await this.prisma.unit.findMany({
      where: { siteId, code: { in: codes } },
      select: { code: true },
    });
    if (clashes.length > 0) {
      throw new BadRequestException(
        `Codes déjà utilisés : ${clashes.map((c) => c.code).join(', ')}`,
      );
    }

    await this.prisma.unit.createMany({
      data: codes.map((code) => ({
        siteId,
        accountId: ctx.accountId,
        blockId: dto.blockId ?? null,
        code,
        type: dto.type,
        baseRent: dto.baseRent,
        chargesIncluded: dto.chargesIncluded,
        shared: dto.shared,
        capacity: dto.capacity,
      })),
    });

    const created = await this.prisma.unit.findMany({
      where: { siteId, code: { in: codes } },
      orderBy: { code: 'asc' },
    });
    return { count: created.length, units: created };
  }

  async get(ctx: RequestContext, id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        occupancies: {
          where: { status: { in: ['ACTIVE', 'NOTICE'] } },
          include: { tenant: { select: { name: true } } },
          take: 1,
        },
      },
    });
    if (!unit) throw new NotFoundException('Unité introuvable');
    await this.assertSite(ctx, unit.siteId);
    const { occupancies, ...rest } = unit;
    return {
      ...rest,
      activeOccupancyId: occupancies[0]?.id ?? null,
      occupantName: occupancies[0]?.tenant.name ?? null,
    };
  }

  async update(ctx: RequestContext, id: string, dto: UpdateUnitDto) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException('Unité introuvable');
    await this.assertSite(ctx, unit.siteId);
    if (typeof dto.blockId === 'string') {
      await this.assertBlockInSite(dto.blockId, unit.siteId);
    }
    return this.prisma.unit.update({ where: { id }, data: dto });
  }

  /** Plan des chambres coloré (RG18 complet) — filtrable par bloc et par couleur. */
  async list(ctx: RequestContext, query: ListUnitsQuery) {
    const site = await this.assertSite(ctx, query.siteId);
    const today = new Date();

    const units = await this.prisma.unit.findMany({
      where: { siteId: query.siteId, ...(query.blockId ? { blockId: query.blockId } : {}) },
      include: {
        occupancies: {
          where: { status: { in: ['ACTIVE', 'NOTICE'] } },
          include: {
            charges: {
              where: { status: { not: 'CANCELLED' } },
              include: {
                allocations: {
                  where: { payment: { status: 'VALID' } },
                  select: { amount: true },
                },
              },
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    const withColor = units.map((unit) => {
      const { occupancies, ...rest } = unit;
      const activeOccupancyId = occupancies[0]?.id ?? null;
      let hasOverdue = false;
      let hasDueSoon = false;
      for (const occ of occupancies) {
        for (const charge of occ.charges) {
          const paid = charge.allocations.reduce((s, a) => s + a.amount, 0);
          if (paid >= charge.amount) continue; // réglée
          const status = computeChargeStatus({
            amount: charge.amount,
            paid,
            dueDate: charge.dueDate,
            today,
            graceDays: site.graceDays,
            cancelled: false,
          });
          if (status === 'OVERDUE') hasOverdue = true;
          else {
            const days = diffDays(today, charge.dueDate);
            if (days >= 0 && days <= 3) hasDueSoon = true;
          }
        }
      }
      const color: UnitColor = computeUnitColor({
        manualStatus: unit.manualStatus,
        hasActiveOccupancy: occupancies.length > 0,
        hasOverdueCharge: hasOverdue,
        hasDueSoonCharge: hasDueSoon,
      });
      return { ...rest, color, activeOccupancyId };
    });

    return query.status ? withColor.filter((u) => u.color === query.status) : withColor;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertSite(ctx: RequestContext, siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site introuvable');
    await this.access.assertSiteAccess(ctx, siteId);
    return site;
  }

  private async assertBlockInSite(blockId: string, siteId: string): Promise<void> {
    const block = await this.prisma.block.findUnique({ where: { id: blockId } });
    if (!block || block.siteId !== siteId) {
      throw new BadRequestException('Bloc invalide pour ce site');
    }
  }
}
