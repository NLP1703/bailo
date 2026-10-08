import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cashQuery,
  createHandoverDto,
  type CashQuery,
  type CreateHandoverDto,
} from '@citegest/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { CashService, assertOwnCash } from './cash.service';

@ApiTags('cash')
@ApiBearerAuth()
@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get()
  @ApiOperation({ summary: 'Journal de caisse (le gardien ne voit que la sienne)' })
  async journal(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(cashQuery)) query: CashQuery,
  ) {
    assertOwnCash(ctx, query.collectorId);
    return this.cash.journal(ctx, query);
  }

  @Post('handovers')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Enregistrer une remise de caisse' })
  async createHandover(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createHandoverDto)) dto: CreateHandoverDto,
  ) {
    return this.cash.createHandover(ctx, dto);
  }
}
