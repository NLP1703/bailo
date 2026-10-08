import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createExpenseDto,
  listExpensesQuery,
  type CreateExpenseDto,
  type ListExpensesQuery,
} from '@citegest/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
@Roles('OWNER', 'MANAGER')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les dépenses' })
  async list(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(listExpensesQuery)) query: ListExpensesQuery,
  ) {
    return this.expenses.list(ctx, query);
  }

  @Post()
  @ApiOperation({ summary: 'Enregistrer une dépense' })
  async create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createExpenseDto)) dto: CreateExpenseDto,
  ) {
    return this.expenses.create(ctx, dto);
  }
}
