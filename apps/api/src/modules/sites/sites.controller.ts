import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createBlockDto,
  createSiteDto,
  updateSiteDto,
  uuid,
  type CreateBlockDto,
  type CreateSiteDto,
  type UpdateSiteDto,
} from '@citegest/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { SitesService } from './sites.service';

@ApiTags('sites')
@ApiBearerAuth()
@Controller('sites')
@Roles('OWNER', 'MANAGER')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les sites accessibles' })
  async list(@CurrentUser() ctx: RequestContext) {
    return this.sites.list(ctx);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un site' })
  async create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createSiteDto)) dto: CreateSiteDto,
  ) {
    return this.sites.create(ctx, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un site' })
  async update(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(updateSiteDto)) dto: UpdateSiteDto,
  ) {
    return this.sites.update(ctx, id, dto);
  }

  @Get(':id/blocks')
  @ApiOperation({ summary: 'Lister les blocs d’un site' })
  async listBlocks(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
  ) {
    return this.sites.listBlocks(ctx, id);
  }

  @Post(':id/blocks')
  @ApiOperation({ summary: 'Créer un bloc' })
  async createBlock(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(createBlockDto)) dto: CreateBlockDto,
  ) {
    return this.sites.createBlock(ctx, id, dto);
  }
}
