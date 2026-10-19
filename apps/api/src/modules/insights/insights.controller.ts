import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  anomaliesQuery,
  resolveAnomalyDto,
  type AnomaliesQuery,
  type ResolveAnomalyDto,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly service: InsightsService) {}

  @Get('anomalies')
  anomalies(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(anomaliesQuery)) q: AnomaliesQuery,
  ) {
    return this.service.anomalies(ctx, q);
  }

  @Post('anomalies/:id/resolve')
  @Roles('OWNER', 'MANAGER')
  resolve(
    @CurrentUser() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveAnomalyDto)) dto: ResolveAnomalyDto,
  ) {
    return this.service.resolveAnomaly(ctx, id, dto);
  }

  @Get('tenants/:id/score')
  score(@CurrentUser() ctx: RequestContext, @Param('id') tenantId: string) {
    return this.service.reliabilityScore(ctx, tenantId);
  }

  @Get('sites/:id/price-suggestion')
  price(@CurrentUser() ctx: RequestContext, @Param('id') siteId: string) {
    return this.service.priceSuggestion(ctx, siteId);
  }

  @Post('detect-now')
  @Roles('OWNER')
  async detect(@CurrentUser() ctx: RequestContext) {
    const n = await this.service.detectAll(ctx.accountId);
    return { created: n };
  }
}
