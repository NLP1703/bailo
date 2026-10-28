import { Injectable, NotFoundException } from '@nestjs/common';
import type { MaintenanceTicket } from '@prisma/client';
import type {
  CreateTicketDto,
  ResolveTicketDto,
  TicketListQuery,
  UpdateTicketDto,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/tenancy/request-context';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import { listMaybePaginated } from '../../common/http/paginate';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: SiteAccessService,
  ) {}

  async list(ctx: RequestContext, q: TicketListQuery) {
    const where = {
      accountId: ctx.accountId,
      ...(q.siteId ? { siteId: q.siteId } : {}),
      ...(q.unitId ? { unitId: q.unitId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
    };
    return listMaybePaginated(
      q,
      (window) =>
        this.prisma.maintenanceTicket.findMany({
          where,
          orderBy: [{ status: 'asc' }, { reportedAt: 'desc' }, { id: 'asc' }],
          include: { unit: { select: { code: true } }, site: { select: { name: true } } },
          ...window,
        }),
      () => this.prisma.maintenanceTicket.count({ where }),
    );
  }

  async create(ctx: RequestContext, dto: CreateTicketDto): Promise<MaintenanceTicket> {
    await this.access.assertSiteAccess(ctx, dto.siteId);
    if (dto.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: dto.unitId, accountId: ctx.accountId },
        select: { siteId: true },
      });
      if (!unit || unit.siteId !== dto.siteId) throw new NotFoundException('Chambre introuvable sur ce site');
    }
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.maintenanceTicket.create({
        data: {
          accountId: ctx.accountId,
          siteId: dto.siteId,
          unitId: dto.unitId,
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          photoKeys: dto.photoKeys,
          reportedBy: ctx.userId,
          createdBy: ctx.userId,
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId, actorId: ctx.userId,
        entity: 'maintenance_ticket', entityId: t.id, action: 'CREATE',
        after: { title: dto.title, priority: dto.priority, siteId: dto.siteId },
      });
      return t;
    });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateTicketDto): Promise<MaintenanceTicket> {
    const t = await this.prisma.maintenanceTicket.findUnique({ where: { id } });
    if (!t || t.accountId !== ctx.accountId) throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.maintenanceTicket.update({
        where: { id },
        data: dto,
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId, actorId: ctx.userId,
        entity: 'maintenance_ticket', entityId: id, action: 'UPDATE',
        before: { status: t.status, priority: t.priority, assignedTo: t.assignedTo },
        after: dto,
      });
      return upd;
    });
  }

  /**
   * Clôt un ticket avec son coût final et, si demandé, crée automatiquement
   * la dépense MAINTENANCE liée (évite la double-saisie).
   */
  async resolve(ctx: RequestContext, id: string, dto: ResolveTicketDto): Promise<MaintenanceTicket> {
    const t = await this.prisma.maintenanceTicket.findUnique({ where: { id } });
    if (!t || t.accountId !== ctx.accountId) throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.maintenanceTicket.update({
        where: { id },
        data: { status: 'DONE', resolvedAt: new Date(), cost: dto.cost },
      });
      if (dto.createExpense && dto.cost > 0) {
        await tx.expense.create({
          data: {
            accountId: ctx.accountId,
            siteId: t.siteId,
            category: 'MAINTENANCE',
            label: `Ticket : ${t.title}`,
            amount: dto.cost,
            spentAt: new Date(),
            note: dto.note,
            ticketId: id,
            createdBy: ctx.userId,
          },
        });
      }
      await this.audit.log(tx, {
        accountId: ctx.accountId, actorId: ctx.userId,
        entity: 'maintenance_ticket', entityId: id, action: 'CLOSE',
        after: { cost: dto.cost, expense: dto.createExpense },
      });
      return upd;
    });
  }
}
