import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminOverview } from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { RequestContext } from '../../common/tenancy/request-context';
import { AdminService } from './admin.service';

/**
 * Point d'entrée des écrans Administration — tout ce qui relève de la
 * gouvernance d'un compte : équipe, droits, journal d'audit, paramètres,
 * abonnement, intégrations, données. Chaque sous-ressource ajoute ses propres
 * routes dans ce même préfixe `/admin/*` au fil des lots.
 *
 * LOT 0 : seule la vue d'ensemble existe, dans une forme minimale ; elle sera
 * enrichie au LOT 1 (jauges de quota, dernières connexions, etc.).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: "Vue d'ensemble du module Administration" })
  async overview(@CurrentUser() ctx: RequestContext): Promise<AdminOverview> {
    return this.admin.overview(ctx);
  }
}
