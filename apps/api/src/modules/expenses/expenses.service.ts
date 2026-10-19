import { Injectable, NotFoundException } from '@nestjs/common';
import type { Expense } from '@prisma/client';
import type { CreateExpenseDto, ExpenseListQuery, UpdateExpenseDto } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/tenancy/request-context';
import { toDate } from '../../common/time/to-date';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(ctx: RequestContext, q: ExpenseListQuery) {
    return this.prisma.expense.findMany({
      where: {
        accountId: ctx.accountId,
        ...(q.siteId ? { siteId: q.siteId } : {}),
        ...(q.category ? { category: q.category } : {}),
        ...(q.from || q.to
          ? { spentAt: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } }
          : {}),
      },
      orderBy: { spentAt: 'desc' },
    });
  }

  async create(ctx: RequestContext, dto: CreateExpenseDto): Promise<Expense> {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: { ...dto, spentAt: toDate(dto.spentAt), accountId: ctx.accountId, createdBy: ctx.userId },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId, actorId: ctx.userId,
        entity: 'expense', entityId: e.id, action: 'CREATE',
        after: { category: e.category, amount: e.amount, siteId: e.siteId },
      });
      return e;
    });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateExpenseDto): Promise<Expense> {
    const e = await this.prisma.expense.findUnique({ where: { id } });
    if (!e || e.accountId !== ctx.accountId) throw new NotFoundException();
    return this.prisma.expense.update({
      where: { id },
      data: { ...dto, spentAt: dto.spentAt ? toDate(dto.spentAt) : undefined },
    });
  }

  /** Résultat net par cité sur une période. */
  async netResult(ctx: RequestContext, from: Date, to: Date) {
    const sites = await this.prisma.site.findMany({ where: { accountId: ctx.accountId }, select: { id: true, name: true } });
    const results: Array<{ siteId: string; name: string; income: number; expense: number; net: number }> = [];
    for (const s of sites) {
      const income = await this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          accountId: ctx.accountId,
          status: 'VALID',
          paidAt: { gte: from, lte: to },
          occupancy: { unit: { siteId: s.id } },
        },
      });
      const expense = await this.prisma.expense.aggregate({
        _sum: { amount: true },
        where: { accountId: ctx.accountId, siteId: s.id, spentAt: { gte: from, lte: to } },
      });
      const inc = income._sum.amount ?? 0;
      const exp = expense._sum.amount ?? 0;
      results.push({ siteId: s.id, name: s.name, income: inc, expense: exp, net: inc - exp });
    }
    return results;
  }
}
