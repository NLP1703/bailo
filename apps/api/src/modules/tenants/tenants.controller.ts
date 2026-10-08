import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createGuarantorDto,
  createTenantDto,
  importTenantsDto,
  listTenantsQuery,
  updateGuarantorDto,
  updateTenantDto,
  uuid,
  type CreateGuarantorDto,
  type CreateTenantDto,
  type ImportTenantsDto,
  type ListTenantsQuery,
  type UpdateGuarantorDto,
  type UpdateTenantDto,
} from '@citegest/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { TenantsService } from './tenants.service';
import { ImportService } from './import.service';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller()
@Roles('OWNER', 'MANAGER')
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly importer: ImportService,
  ) {}

  @Post('tenants/import')
  @ApiOperation({ summary: 'Import de locataires (lignes Excel/CSV parsées par le front)' })
  async import(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(importTenantsDto)) dto: ImportTenantsDto,
  ) {
    return this.importer.importTenants(ctx, dto);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Lister / rechercher les locataires' })
  async list(@Query(new ZodValidationPipe(listTenantsQuery)) query: ListTenantsQuery) {
    return this.tenants.list(query);
  }

  @Post('tenants')
  @ApiOperation({ summary: 'Créer un locataire' })
  async create(@Body(new ZodValidationPipe(createTenantDto)) dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Fiche locataire + garants' })
  async get(@Param('id', new ZodValidationPipe(uuid)) id: string) {
    return this.tenants.get(id);
  }

  @Patch('tenants/:id')
  @ApiOperation({ summary: 'Modifier un locataire' })
  async update(
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(updateTenantDto)) dto: UpdateTenantDto,
  ) {
    return this.tenants.update(id, dto);
  }

  @Post('tenants/:id/guarantors')
  @ApiOperation({ summary: 'Ajouter un garant' })
  async addGuarantor(
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(createGuarantorDto)) dto: CreateGuarantorDto,
  ) {
    return this.tenants.addGuarantor(id, dto);
  }

  @Patch('guarantors/:id')
  @ApiOperation({ summary: 'Modifier un garant / payeur principal' })
  async updateGuarantor(
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(updateGuarantorDto)) dto: UpdateGuarantorDto,
  ) {
    return this.tenants.updateGuarantor(id, dto);
  }
}
