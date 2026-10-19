import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Inspection } from '@prisma/client';
import type {
  CloseExitInspectionDto,
  CreateInspectionDto,
  DepositSummary,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/tenancy/request-context';
import { toDate } from '../../common/time/to-date';

@Injectable()
export class InspectionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(ctx: RequestContext, dto: CreateInspectionDto): Promise<Inspection> {
    const occ = await this.prisma.occupancy.findUnique({
      where: { id: dto.occupancyId },
      select: { accountId: true },
    });
    if (!occ || occ.accountId !== ctx.accountId) throw new NotFoundException('Occupation introuvable');
    const dmg = dto.items.reduce((s, i) => s + (i.condition === 'DAMAGED' ? i.estimatedCost ?? 0 : 0), 0);
    return this.prisma.$transaction(async (tx) => {
      const insp = await tx.inspection.create({
        data: {
          accountId: ctx.accountId,
          occupancyId: dto.occupancyId,
          kind: dto.kind,
          performedAt: dto.performedAt ? toDate(dto.performedAt) : new Date(),
          performedBy: ctx.userId,
          summary: dto.summary,
          photoKeys: dto.photoKeys,
          // Pour une entrée : retenue toujours à 0 ; pour une sortie, pré-rempli depuis les items.
          withholding: dto.kind === 'EXIT' ? dmg : 0,
          items: {
            create: dto.items.map((i) => ({
              room: i.room,
              element: i.element,
              condition: i.condition,
              note: i.note,
              photoKeys: i.photoKeys,
              estimatedCost: i.estimatedCost,
            })),
          },
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'inspection',
        entityId: insp.id,
        action: 'CREATE',
        after: { kind: dto.kind, items: dto.items.length, withholding: insp.withholding },
      });
      return insp;
    });
  }

  async closeExit(ctx: RequestContext, id: string, dto: CloseExitInspectionDto): Promise<Inspection> {
    return this.prisma.$transaction(async (tx) => {
      const insp = await tx.inspection.findUnique({ where: { id } });
      if (!insp || insp.accountId !== ctx.accountId) throw new NotFoundException();
      if (insp.kind !== 'EXIT') throw new BadRequestException('Clôture réservée aux états des lieux de sortie');
      const upd = await tx.inspection.update({
        where: { id },
        data: {
          withholding: dto.withholding,
          withholdingNote: dto.withholdingNote,
          tenantSignatureName: dto.tenantSignatureName,
          signedByTenantAt: dto.tenantSignatureName ? new Date() : insp.signedByTenantAt,
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'inspection',
        entityId: id,
        action: 'CLOSE',
        after: { withholding: dto.withholding, note: dto.withholdingNote },
      });
      return upd;
    });
  }

  async listForOccupancy(ctx: RequestContext, occupancyId: string) {
    return this.prisma.inspection.findMany({
      where: { accountId: ctx.accountId, occupancyId },
      include: { items: true },
      orderBy: { performedAt: 'asc' },
    });
  }

  /** Résumé caution : caution payée - total des retenues (sortie). Jamais négatif. */
  async depositSummary(ctx: RequestContext, occupancyId: string): Promise<DepositSummary> {
    const occ = await this.prisma.occupancy.findUnique({
      where: { id: occupancyId },
      select: { accountId: true, deposit: true },
    });
    if (!occ || occ.accountId !== ctx.accountId) throw new NotFoundException();
    const inspections = await this.prisma.inspection.findMany({
      where: { accountId: ctx.accountId, occupancyId, kind: 'EXIT' },
      select: { id: true, withholding: true, withholdingNote: true },
    });
    const totalWithheld = inspections.reduce((s, i) => s + i.withholding, 0);
    return {
      deposit: occ.deposit,
      withholdings: inspections.map((i) => ({ inspectionId: i.id, amount: i.withholding, note: i.withholdingNote })),
      totalWithheld,
      refundable: Math.max(0, occ.deposit - totalWithheld),
    };
  }
}
