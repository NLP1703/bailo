import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createExpenseDto,
  expenseListQuery,
  updateExpenseDto,
  type CreateExpenseDto,
  type ExpenseListQuery,
  type UpdateExpenseDto,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { ExpensesService } from './expenses.service';
import { toDate } from '../../common/time/to-date';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  list(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(expenseListQuery)) q: ExpenseListQuery,
  ) {
    return this.service.list(ctx, q);
  }

  @Get('net-result')
  @Roles('OWNER', 'MANAGER')
  net(
    @CurrentUser() ctx: RequestContext,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.netResult(ctx, toDate(from), toDate(to));
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createExpenseDto)) dto: CreateExpenseDto,
  ) {
    return this.service.create(ctx, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  update(
    @CurrentUser() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExpenseDto)) dto: UpdateExpenseDto,
  ) {
    return this.service.update(ctx, id, dto);
  }
}
