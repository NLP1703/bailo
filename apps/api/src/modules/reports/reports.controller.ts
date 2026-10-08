import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  arrearsQuery,
  dashboardQuery,
  exportQuery,
  EXPORT_TYPES,
  type ArrearsQuery,
  type DashboardQuery,
  type ExportQuery,
} from '@citegest/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { ReportsService } from './reports.service';
import { ExportsService } from './exports.service';

const exportTypeParam = z.enum(EXPORT_TYPES);

@ApiTags('reports')
@ApiBearerAuth()
@Controller()
@Roles('OWNER', 'MANAGER')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exports: ExportsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Tableau de bord du mois (F11.1/3/4)' })
  async dashboard(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(dashboardQuery)) query: DashboardQuery,
  ) {
    return this.reports.dashboard(ctx, query);
  }

  @Get('reports/arrears')
  @ApiOperation({ summary: 'Impayés triés (F11.2)' })
  async arrears(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(arrearsQuery)) query: ArrearsQuery,
  ) {
    return this.reports.arrears(ctx, query);
  }

  @Get('exports/:type')
  @ApiOperation({ summary: 'Export CSV/PDF : payments | arrears | tenants (F11.5)' })
  async export(
    @CurrentUser() ctx: RequestContext,
    @Param('type', new ZodValidationPipe(exportTypeParam)) type: (typeof EXPORT_TYPES)[number],
    @Query(new ZodValidationPipe(exportQuery)) query: ExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const out = await this.exports.export(ctx, type, query);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.buffer);
  }
}
