import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  computeChargeStatus,
  computeUnitColor,
  diffDays,
  type BulkCreateUnitsDto,
  type CreateUnitDto,
  type ListUnitsQuery,
  type ReserveUnitDto,
  type UnitColor,
  type UpdateUnitDto,
} from '@bailo/shared';
import { toDate } from '../../common/time/to-date';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../../common/billing/billing.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import type { RequestContext } from '../../common/tenancy/request-context';

const MAX_BULK_UNITS = 500;

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SiteAccessService,
    private readonly billing: BillingService,
  ) {}

  async create(ctx: RequestContext, siteId: string, dto: CreateUnitDto) {
    await this.assertSite(ctx, siteId);
    await this.billing.assertUnitQuota(ctx.accountId, 1);
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
    await this.billing.assertUnitQuota(ctx.accountId, count);
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
        furnished: dto.furnished ?? false,
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
      reservedUntil: unit.reservedUntil ? unit.reservedUntil.toISOString() : null,
      reservedFor: unit.reservedFor,
      reservationDepositAmount: unit.reservationDepositAmount,
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

  /**
   * Réserve une unité : la passe RESERVED (bleu) et stocke la date d'arrivée prévue
   * du futur locataire. La maintenance quotidienne la rebasculera en AVAILABLE à partir
   * de cette date (voir `MaintenanceService.expireReservations`).
   */
  async reserve(ctx: RequestContext, id: string, dto: ReserveUnitDto) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: { occupancies: { where: { status: { in: ['ACTIVE', 'NOTICE'] } }, take: 1 } },
    });
    if (!unit) throw new NotFoundException('Unité introuvable');
    await this.assertSite(ctx, unit.siteId);
    if (unit.occupancies.length > 0) {
      throw new BadRequestException(
        'Cette unité est déjà occupée — on ne peut pas la réserver',
      );
    }

    const arrival = toDate(dto.expectedArrivalDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (arrival < today) {
      throw new BadRequestException(
        "La date d'arrivée doit être aujourd'hui ou dans le futur",
      );
    }

    return this.prisma.unit.update({
      where: { id },
      data: {
        manualStatus: 'RESERVED',
        reservedUntil: arrival,
        reservedFor: dto.tenantName ?? null,
        reservationDepositAmount: dto.depositAmount && dto.depositAmount > 0 ? dto.depositAmount : null,
      },
    });
  }

  /**
   * Liste toutes les chambres actuellement RÉSERVÉES (sur l'ensemble des sites du compte).
   * Chaque entrée : code chambre + site + nom du futur locataire + date d'arrivée + jours restants.
   */
  async listReservations(ctx: RequestContext) {
    const accessible = await this.access.accessibleSiteIds(ctx);
    const siteFilter = accessible === 'ALL' ? {} : { siteId: { in: accessible } };
    const units = await this.prisma.unit.findMany({
      where: { manualStatus: 'RESERVED', ...siteFilter },
      include: { site: { select: { id: true, name: true } } },
      orderBy: [{ reservedUntil: 'asc' }, { code: 'asc' }],
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return units.map((u) => {
      const arrival = u.reservedUntil;
      const daysUntil = arrival
        ? Math.floor((arrival.getTime() - today.getTime()) / 86_400_000)
        : null;
      return {
        unitId: u.id,
        unitCode: u.code,
        siteId: u.siteId,
        siteName: u.site.name,
        reservedFor: u.reservedFor,
        reservedUntil: arrival ? arrival.toISOString() : null,
        reservationDepositAmount: u.reservationDepositAmount,
        daysUntil,
        isExpired: daysUntil !== null && daysUntil < 0,
        isToday: daysUntil === 0,
      };
    });
  }

  /** Annule une réservation : repasse la chambre à AVAILABLE et efface les champs. */
  async unreserve(ctx: RequestContext, id: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException('Unité introuvable');
    await this.assertSite(ctx, unit.siteId);
    return this.prisma.unit.update({
      where: { id },
      data: {
        manualStatus: 'AVAILABLE',
        reservedUntil: null,
        reservedFor: null,
        reservationDepositAmount: null,
      },
    });
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
            tenant: { select: { name: true } }, // nom affiché sur la case colorée
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
      const occ = occupancies[0];
      const activeOccupancyId = occ?.id ?? null;
      const tenantName = occ?.tenant?.name ?? null;

      let hasOverdue = false;
      let hasDueSoon = false;
      // Prochaine échéance non réglée (la plus proche en date) — toutes types confondues,
      // car un locataire qui doit encore de la caution doit la régler avant un loyer.
      let nextDueDate: Date | null = null;
      let nextDueAmount = 0;

      for (const o of occupancies) {
        for (const charge of o.charges) {
          const paid = charge.allocations.reduce((s, a) => s + a.amount, 0);
          const remaining = charge.amount - paid;
          if (remaining <= 0) continue; // réglée
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
          if (!nextDueDate || charge.dueDate < nextDueDate) {
            nextDueDate = charge.dueDate;
            nextDueAmount = remaining;
          }
        }
      }
      // Expiration vivante d'une réservation : si la date d'arrivée est atteinte
      // (reservedUntil ≤ aujourd'hui), on traite la chambre comme AVAILABLE pour la
      // coloration — même si le cron de maintenance n'a pas encore tourné.
      const effectiveManualStatus =
        unit.manualStatus === 'RESERVED' &&
        unit.reservedUntil &&
        unit.reservedUntil.getTime() <= today.getTime()
          ? 'AVAILABLE'
          : unit.manualStatus;
      const color: UnitColor = computeUnitColor({
        manualStatus: effectiveManualStatus,
        hasActiveOccupancy: occupancies.length > 0,
        hasOverdueCharge: hasOverdue,
        hasDueSoonCharge: hasDueSoon,
      });
      return {
        ...rest,
        color,
        activeOccupancyId,
        tenantName,
        nextDueDate: nextDueDate ? nextDueDate.toISOString() : null,
        nextDueAmount: nextDueDate ? nextDueAmount : null,
        reservedUntil: unit.reservedUntil ? unit.reservedUntil.toISOString() : null,
        reservedFor: unit.reservedFor,
      };
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
