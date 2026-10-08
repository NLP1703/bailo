import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  bulkCreateUnitsDto,
  createUnitDto,
  listUnitsQuery,
  updateUnitDto,
  uuid,
  type BulkCreateUnitsDto,
  type ListUnitsQuery,
  type UpdateUnitDto,
} from '@citegest/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { UnitsService } from './units.service';

// POST /units : le corps porte le siteId (les routes en série passent par /sites/:id).
const createUnitBody = createUnitDto.extend({ siteId: uuid });
type CreateUnitBody = z.infer<typeof createUnitBody>;

@ApiTags('units')
@ApiBearerAuth()
@Controller()
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get('units')
  @ApiOperation({ summary: 'Plan des chambres (couleur RG18), filtres bloc/statut' })
  async list(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(listUnitsQuery)) query: ListUnitsQuery,
  ) {
    return this.units.list(ctx, query);
  }

  @Post('units')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Créer une unité' })
  async create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createUnitBody)) dto: CreateUnitBody,
  ) {
    const { siteId, ...unit } = dto;
    return this.units.create(ctx, siteId, unit);
  }

  @Get('units/:id')
  @ApiOperation({ summary: 'Fiche d’une unité (édition)' })
  async get(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
  ) {
    return this.units.get(ctx, id);
  }

  @Patch('units/:id')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Modifier une unité' })
  async update(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(updateUnitDto)) dto: UpdateUnitDto,
  ) {
    return this.units.update(ctx, id, dto);
  }

  @Post('sites/:id/units/bulk')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Créer des unités en série (« A01 à A24 »)' })
  async bulk(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) siteId: string,
    @Body(new ZodValidationPipe(bulkCreateUnitsDto)) dto: BulkCreateUnitsDto,
  ) {
    return this.units.bulkCreate(ctx, siteId, dto);
  }
}
