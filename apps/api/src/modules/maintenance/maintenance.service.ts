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

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(ctx: RequestContext, q: TicketListQuery) {
    return this.prisma.maintenanceTicket.findMany({
      where: {
        accountId: ctx.accountId,
        ...(q.siteId ? { siteId: q.siteId } : {}),
        ...(q.unitId ? { unitId: q.unitId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.priority ? { priority: q.priority } : {}),
      },
      orderBy: [{ status: 'asc' }, { reportedAt: 'desc' }],
      include: { unit: { select: { code: true } }, site: { select: { name: true } } },
    });
  }

  async create(ctx: RequestContext, dto: CreateTicketDto): Promise<MaintenanceTicket> {
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
