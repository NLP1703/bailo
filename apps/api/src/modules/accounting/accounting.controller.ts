import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ohadaExportQuery, type OhadaExportQuery } from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { AccountingService } from './accounting.service';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting')
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  /** Aperçu JSON — alimente l'écran Comptabilité (lignes + totaux + grand livre). */
  @Get('ohada-journal/preview')
  @Roles('OWNER', 'MANAGER')
  async preview(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(ohadaExportQuery)) q: OhadaExportQuery,
  ) {
    const rows = await this.service.journal(ctx, q);
    return this.service.summarize(rows);
  }

  /** Export CSV avec BOM UTF-8 (ouvrable directement dans Excel / LibreOffice). */
  @Get('ohada-journal')
  @Roles('OWNER', 'MANAGER')
  async journal(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(ohadaExportQuery)) q: OhadaExportQuery,
    @Res() res: Response,
  ) {
    const rows = await this.service.journal(ctx, q);
    const csv = this.service.csv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bailo-ohada-${q.from.slice(0, 10)}-${q.to.slice(0, 10)}.csv"`);
    res.send('﻿' + csv); // BOM pour Excel
  }
}
