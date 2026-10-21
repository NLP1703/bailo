import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  renderTemplate,
  updateAdminAccountDto,
  adminTemplatePreviewDto,
  TEMPLATE_VARIABLES,
  type AdminAccountView,
  type AdminTemplatePreviewDto,
  type UpdateAdminAccountDto,
} from '@bailo/shared';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../../common/tenancy/request-context';
import { AdminAccountService } from './admin-account.service';

/**
 * Routes `/admin/account` — paramètres riches du compte (Lot 4).
 *
 * Toutes OWNER-only. L'ancien `/account` reste pour les routes transverses
 * (lecture du profil courant, suppression du compte, billing).
 *
 * `/admin/account/preview-template` est un utilitaire sans effet de bord :
 * il renvoie le rendu d'un corps de modèle avec les variables fournies, pour
 * l'aperçu dans l'éditeur de modèles.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/account')
@Roles('OWNER')
export class AdminAccountController {
  constructor(private readonly service: AdminAccountService) {}

  @Get()
  @ApiOperation({ summary: 'Paramètres riches du compte (Lot 4)' })
  async get(@CurrentUser() ctx: RequestContext): Promise<AdminAccountView> {
    return this.service.get(ctx);
  }

  @Patch()
  @ApiOperation({ summary: 'Modifier les paramètres du compte (audit avant/après)' })
  async update(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(updateAdminAccountDto)) dto: UpdateAdminAccountDto,
  ): Promise<AdminAccountView> {
    return this.service.update(ctx, dto);
  }

  @Get('template-variables')
  @ApiOperation({ summary: 'Variables disponibles dans les modèles de messages' })
  variables(): { variables: readonly string[] } {
    return { variables: TEMPLATE_VARIABLES };
  }

  @Patch('preview-template')
  @ApiOperation({ summary: 'Aperçu d’un modèle de message avec les variables fournies' })
  previewTemplate(
    @Body(new ZodValidationPipe(adminTemplatePreviewDto)) dto: AdminTemplatePreviewDto,
  ): { preview: string } {
    return { preview: renderTemplate(dto.bodyHtml, dto.vars ?? {}) };
  }
}
