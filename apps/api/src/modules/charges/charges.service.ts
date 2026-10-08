import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ChargeType } from '@prisma/client';
import type { CancelChargeDto, CreateChargeDto } from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import { toDate } from '../../common/time/to-date';
import type { RequestContext } from '../../common/tenancy/request-context';
import { BalanceService } from '../finance/balance.service';

@Injectable()
export class ChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly audit: AuditService,
    private readonly access: SiteAccessService,
  ) {}

  /** Échéance ponctuelle : caution, eau, électricité, frais, réparation… (F5.2). */
  async create(ctx: RequestContext, dto: CreateChargeDto) {
    const occupancy = await this.loadOccupancy(dto.occupancyId);
    await this.access.assertSiteAccess(ctx, occupancy.unit.siteId);

    const dueDate = toDate(dto.dueDate);
    return this.prisma.$transaction(async (tx) => {
      const charge = await tx.charge.create({
        data: {
          accountId: ctx.accountId,
          occupancyId: dto.occupancyId,
          type: dto.type as ChargeType,
          amount: dto.amount,
          dueDate,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
          status: dueDate.getTime() <= Date.now() ? 'DUE' : 'UPCOMING',
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'charge',
        entityId: charge.id,
        action: 'CREATE',
        after: { type: charge.type, amount: charge.amount },
      });
      return charge;
    });
  }

  /** Remise / annulation avec motif obligatoire (F5.5). Interdite si déjà payée en partie. */
  async cancel(ctx: RequestContext, id: string, dto: CancelChargeDto) {
    const charge = await this.prisma.charge.findUnique({ where: { id } });
    if (!charge) throw new NotFoundException('Échéance introuvable');
    if (charge.status === 'CANCELLED') throw new BadRequestException('Échéance déjà annulée');

    const paid = (await this.balance.paidByCharge(this.prisma, [id])).get(id) ?? 0;
    if (paid > 0) {
      throw new BadRequestException(
        'Échéance déjà réglée en partie : annuler le paiement d’abord (RG8)',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.charge.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: dto.reason },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'charge',
        entityId: id,
        action: 'UPDATE',
        before: { status: charge.status },
        after: { status: 'CANCELLED' },
        reason: dto.reason,
      });
      return updated;
    });
  }

  async listByOccupancy(occupancyId: string) {
    const occupancy = await this.loadOccupancy(occupancyId);
    return this.balance.chargeViews(
      this.prisma,
      occupancyId,
      occupancy.unit.site.graceDays,
      new Date(),
    );
  }

  private async loadOccupancy(id: string) {
    const occupancy = await this.prisma.occupancy.findUnique({
      where: { id },
      include: { unit: { include: { site: true } } },
    });
    if (!occupancy) throw new NotFoundException('Occupation introuvable');
    return occupancy;
  }
}
