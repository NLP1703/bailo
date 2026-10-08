import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateExpenseDto, ListExpensesQuery } from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import { toDate } from '../../common/time/to-date';
import type { RequestContext } from '../../common/tenancy/request-context';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SiteAccessService,
  ) {}

  async create(ctx: RequestContext, dto: CreateExpenseDto) {
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
    if (!site) throw new NotFoundException('Site introuvable');
    await this.access.assertSiteAccess(ctx, dto.siteId);

    return this.prisma.expense.create({
      data: {
        accountId: ctx.accountId,
        siteId: dto.siteId,
        unitId: dto.unitId,
        category: dto.category,
        amount: dto.amount,
        spentAt: toDate(dto.spentAt),
        description: dto.description,
        attachmentKey: dto.attachmentKey,
      },
    });
  }

  async list(ctx: RequestContext, query: ListExpensesQuery) {
    const siteFilter = await this.access.siteIdFilter(ctx); // {} (owner) ou {id:{in:[...]}}
    const siteIds = siteFilter.id as { in: string[] } | undefined;
    const spentAt: Prisma.DateTimeFilter = {
      ...(query.from ? { gte: toDate(query.from) } : {}),
      ...(query.to ? { lte: toDate(query.to) } : {}),
    };
    return this.prisma.expense.findMany({
      where: {
        ...(query.siteId
          ? { siteId: query.siteId }
          : siteIds
            ? { siteId: { in: siteIds.in } }
            : {}),
        ...(query.from || query.to ? { spentAt } : {}),
      },
      orderBy: { spentAt: 'desc' },
    });
  }
}
