import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { syncPullQuery, syncPushDto, type SyncPullQuery, type SyncPushDto } from '@bailo/shared';
import { AllowWhenReadOnly } from '../../common/auth/allow-read-only.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { SyncService } from './sync.service';

const deviceHeader = z.string().uuid().optional().catch(undefined);

/**
 * Synchronisation hors-ligne (apps/mobile/docs/02-protocole-synchronisation.md).
 * Les deux routes acceptent l'ancien format du site web et le protocole mobile.
 */
@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  // Compte en lecture seule : chaque opération mobile est refusée une à une (elle va
  // « à corriger ») au lieu de bloquer toute la file.
  @Post('push')
  @AllowWhenReadOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envoyer la file hors-ligne (opérations idempotentes, dans l’ordre)' })
  async push(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(syncPushDto)) dto: SyncPushDto,
  ) {
    return this.sync.push(ctx, dto);
  }

  @Get('pull')
  @ApiOperation({
    summary: 'Recevoir les changements (par site et curseur, ou instantané du compte)',
  })
  async pull(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(syncPullQuery)) query: SyncPullQuery,
    @Headers('x-bailo-device') device?: string,
  ) {
    return this.sync.pull(ctx, query, deviceHeader.parse(device));
  }
}
