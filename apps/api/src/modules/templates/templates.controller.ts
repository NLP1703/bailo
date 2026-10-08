import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listTemplatesQuery,
  upsertTemplateDto,
  type ListTemplatesQuery,
  type UpsertTemplateDto,
} from '@citegest/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
@Roles('OWNER')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les modèles (message/contrat/reçu) FR/EN' })
  async list(@Query(new ZodValidationPipe(listTemplatesQuery)) query: ListTemplatesQuery) {
    return this.templates.list(query);
  }

  @Put()
  @ApiOperation({ summary: 'Créer ou modifier un modèle' })
  async upsert(@Body(new ZodValidationPipe(upsertTemplateDto)) dto: UpsertTemplateDto) {
    return this.templates.upsert(dto);
  }
}
