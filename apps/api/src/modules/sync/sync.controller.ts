import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { syncPullQuery, syncPushDto, type SyncPullQuery, type SyncPushDto } from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @ApiOperation({ summary: 'Pousser la file hors-ligne (paiements idempotents)' })
  async push(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(syncPushDto)) dto: SyncPushDto,
  ) {
    return this.sync.push(ctx, dto);
  }

  @Get('pull')
  @ApiOperation({ summary: 'Récupérer le delta pour le cache local' })
  async pull(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(syncPullQuery)) query: SyncPullQuery,
  ) {
    return this.sync.pull(ctx, query);
  }
}
