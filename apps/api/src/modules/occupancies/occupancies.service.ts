import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  computeCloseout,
  generateRentSchedule,
  type CloseOccupancyDto,
  type CreateOccupancyDto,
  type NoticeOccupancyDto,
} from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import { toDate } from '../../common/time/to-date';
import type { RequestContext } from '../../common/tenancy/request-context';
import { BalanceService } from '../finance/balance.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class OccupanciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly access: SiteAccessService,
  ) {}

  /** Nouvelle entrée : occupation + échéances (RG1–4) + caution + paiement d'ouverture. */
  async create(ctx: RequestContext, dto: CreateOccupancyDto) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      include: { site: true },
    });
    if (!unit) throw new NotFoundException('Unité introuvable');
    await this.access.assertSiteAccess(ctx, unit.siteId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) throw new NotFoundException('Locataire introuvable');

    const startDate = toDate(dto.startDate);
    const plannedEndDate = dto.plannedEndDate ? toDate(dto.plannedEndDate) : null;
    if (plannedEndDate && plannedEndDate < startDate) {
      throw new BadRequestException('La fin prévue doit être postérieure à l’entrée');
    }

    const schedule = generateRentSchedule({
      startDate,
      plannedEndDate,
      monthlyRent: dto.monthlyRent,
      dueDay: dto.dueDay,
      prorataFirstMonth: unit.site.prorataMode === 'PRORATA',
    });

    const account = await this.prisma.account.findUnique({ where: { id: ctx.accountId } });

    return this.prisma.$transaction(async (tx) => {
      // Contrainte d'exclusion RG17 : une occupation active chevauchante lève ici.
      const occupancy = await tx.occupancy.create({
        data: {
          accountId: ctx.accountId,
          unitId: dto.unitId,
          tenantId: dto.tenantId,
          startDate,
          plannedEndDate,
          monthlyRent: dto.monthlyRent,
          dueDay: dto.dueDay,
          deposit: dto.deposit,
          status: 'ACTIVE',
          chargesGeneratedUntil: schedule.generatedUntil,
        },
      });

      // Caution en premier (échéance à part, RG14) pour qu'elle soit réglée avant les loyers.
      if (dto.deposit > 0) {
        await tx.charge.create({
          data: {
            accountId: ctx.accountId,
            occupancyId: occupancy.id,
            type: 'CAUTION',
            amount: dto.deposit,
            dueDate: startDate,
            status: 'DUE',
          },
        });
      }

      const rentCharges = [];
      for (const rc of schedule.charges) {
        rentCharges.push(
          await tx.charge.create({
            data: {
              accountId: ctx.accountId,
              occupancyId: occupancy.id,
              type: 'LOYER',
              periodYear: rc.periodYear,
              periodMonth: rc.periodMonth,
              amount: rc.amount,
              dueDate: rc.dueDate,
              status: 'UPCOMING',
            },
          }),
        );
      }

      // Montant encaissé à l'entrée : caution + avance (nombre de mois ou montant).
      const rentAdvance =
        dto.advance?.amount ??
        (dto.advance?.months
          ? rentCharges.slice(0, dto.advance.months).reduce((s, c) => s + c.amount, 0)
          : 0);
      const openingAmount = (dto.deposit > 0 ? dto.deposit : 0) + rentAdvance;

      let openingPayment = null;
      if (openingAmount > 0) {
        openingPayment = await this.payments.recordTx(tx, {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          occupancyId: occupancy.id,
          clientId: dto.clientId ?? randomUUID(),
          amount: openingAmount,
          mode: dto.paymentMode,
          paidAt: startDate,
          receiptPrefix: account?.receiptPrefix ?? 'CG',
        });
      }

      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'occupancy',
        entityId: occupancy.id,
        action: 'CREATE',
        after: {
          unitId: dto.unitId,
          monthlyRent: dto.monthlyRent,
          deposit: dto.deposit,
          openingAmount,
        },
      });

      const summary = await this.balance.summary(tx, occupancy.id, unit.site.graceDays, new Date());
      return { occupancy, summary, openingPayment };
    });
  }

  async get(id: string) {
    const occupancy = await this.prisma.occupancy.findUnique({
      where: { id },
      include: { unit: { include: { site: true } }, tenant: true },
    });
    if (!occupancy) throw new NotFoundException('Occupation introuvable');
    const summary = await this.balance.summary(
      this.prisma,
      id,
      occupancy.unit.site.graceDays,
      new Date(),
    );
    return { occupancy, summary };
  }

  async notice(ctx: RequestContext, id: string, dto: NoticeOccupancyDto) {
    const occupancy = await this.prisma.occupancy.findUnique({ where: { id } });
    if (!occupancy) throw new NotFoundException('Occupation introuvable');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.occupancy.update({
        where: { id },
        data: { noticeDate: toDate(dto.noticeDate), status: 'NOTICE' },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'occupancy',
        entityId: id,
        action: 'UPDATE',
        before: { status: occupancy.status },
        after: { status: 'NOTICE', noticeDate: dto.noticeDate },
      });
      return updated;
    });
  }

  /** Clôture : annule les loyers futurs, calcule la caution à rembourser (RG15/RG16). */
  async close(ctx: RequestContext, id: string, dto: CloseOccupancyDto) {
    const occupancy = await this.prisma.occupancy.findUnique({
      where: { id },
      include: { unit: { include: { site: true } } },
    });
    if (!occupancy) throw new NotFoundException('Occupation introuvable');
    if (occupancy.status === 'CLOSED') throw new BadRequestException('Occupation déjà clôturée');

    const actualEndDate = toDate(dto.actualEndDate);

    return this.prisma.$transaction(async (tx) => {
      // Loyers dont l'échéance est postérieure à la sortie → annulés (non dus).
      await tx.charge.updateMany({
        where: {
          occupancyId: id,
          type: 'LOYER',
          status: { not: 'CANCELLED' },
          dueDate: { gt: actualEndDate },
        },
        data: { status: 'CANCELLED', cancelReason: 'Sortie du locataire' },
      });

      const views = await this.balance.chargeViews(
        tx,
        id,
        occupancy.unit.site.graceDays,
        actualEndDate,
      );
      const depositPaid = views
        .filter((v) => v.charge.type === 'CAUTION')
        .reduce((s, v) => s + v.paid, 0);
      const unpaidTotal = views
        .filter((v) => v.charge.type !== 'CAUTION' && v.charge.status !== 'CANCELLED')
        .reduce((s, v) => s + v.remaining, 0);

      const closeout = computeCloseout({ depositPaid, unpaidTotal, retenues: dto.retenues });
      const closeSummary = {
        ...closeout,
        retenues: dto.retenues,
        actualEndDate: dto.actualEndDate,
      };

      const updated = await tx.occupancy.update({
        where: { id },
        data: {
          status: 'CLOSED',
          actualEndDate,
          closeSummary: closeSummary as unknown as Prisma.InputJsonValue,
        },
      });

      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'occupancy',
        entityId: id,
        action: 'CLOSE',
        before: { status: occupancy.status },
        after: closeSummary,
      });

      return { occupancy: updated, closeSummary };
    });
  }
}
