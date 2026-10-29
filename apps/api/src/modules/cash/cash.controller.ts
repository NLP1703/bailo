import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cashQuery,
  createHandoverDto,
  type CashQuery,
  type CreateHandoverDto,
} from '@bailo/shared';
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

  // Le gardien déclare sa propre remise (application mobile, T8) ; elle reste à confirmer
  // par le propriétaire. Le propriétaire et le gérant enregistrent celles qu'ils reçoivent.
  @Post('handovers')
  @Roles('OWNER', 'MANAGER', 'CARETAKER')
  @ApiOperation({ summary: 'Enregistrer ou déclarer une remise de caisse' })
  async createHandover(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createHandoverDto)) dto: CreateHandoverDto,
  ) {
    return this.cash.createHandover(ctx, dto);
  }
}
