import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  auditFiltersQuery,
  type AuditFiltersQuery,
  type AuditListResult,
} from '@bailo/shared';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../../common/tenancy/request-context';
import { AdminAuditService } from './admin-audit.service';

/**
 * Routes de LECTURE du journal d'audit (Lot 3). OWNER voit tout, MANAGER voit
 * ses sites + lignes sans siteId. Aucune route d'écriture : le journal est
 * alimenté exclusivement par AuditService.log depuis les autres services.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('OWNER', 'MANAGER')
@Controller('admin/audit')
export class AdminAuditController {
  constructor(private readonly service: AdminAuditService) {}

  @Get()
  @ApiOperation({ summary: "Lister les entrées du journal d'audit (curseur, filtres)" })
  async list(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(auditFiltersQuery)) q: AuditFiltersQuery,
  ): Promise<AuditListResult> {
    return this.service.list(ctx, q);
  }

  @Get('export')
  @ApiOperation({ summary: "Export CSV UTF-8 BOM du journal d'audit (filtres respectés)" })
  async export(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(auditFiltersQuery)) q: AuditFiltersQuery,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportCsv(ctx, q);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bailo-audit-${stamp}.csv"`);
    res.send(csv);
  }
}
