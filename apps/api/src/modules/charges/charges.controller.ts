import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cancelChargeDto,
  createChargeDto,
  uuid,
  type CancelChargeDto,
  type CreateChargeDto,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { ChargesService } from './charges.service';

@ApiTags('charges')
@ApiBearerAuth()
@Controller()
export class ChargesController {
  constructor(private readonly charges: ChargesService) {}

  @Get('occupancies/:id/charges')
  @ApiOperation({ summary: 'Échéances d’une occupation (avec statut calculé)' })
  async list(@Param('id', new ZodValidationPipe(uuid)) id: string) {
    return this.charges.listByOccupancy(id);
  }

  @Post('charges')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Ajouter une échéance ponctuelle' })
  async create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createChargeDto)) dto: CreateChargeDto,
  ) {
    return this.charges.create(ctx, dto);
  }

  @Patch('charges/:id/cancel')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Remise / annulation d’une échéance (motif obligatoire)' })
  async cancel(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(cancelChargeDto)) dto: CancelChargeDto,
  ) {
    return this.charges.cancel(ctx, id, dto);
  }
}
