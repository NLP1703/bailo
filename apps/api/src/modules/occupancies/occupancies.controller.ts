import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  closeOccupancyDto,
  createOccupancyDto,
  noticeOccupancyDto,
  uuid,
  type CloseOccupancyDto,
  type CreateOccupancyDto,
  type NoticeOccupancyDto,
} from '@citegest/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { OccupanciesService } from './occupancies.service';

@ApiTags('occupancies')
@ApiBearerAuth()
@Controller('occupancies')
export class OccupanciesController {
  constructor(private readonly occupancies: OccupanciesService) {}

  @Post()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Nouvelle entrée (génère échéances, caution, paiement d’ouverture)' })
  async create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createOccupancyDto)) dto: CreateOccupancyDto,
  ) {
    return this.occupancies.create(ctx, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’une occupation + soldes' })
  async get(@Param('id', new ZodValidationPipe(uuid)) id: string) {
    return this.occupancies.get(id);
  }

  @Post(':id/notice')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Enregistrer un préavis' })
  async notice(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(noticeOccupancyDto)) dto: NoticeOccupancyDto,
  ) {
    return this.occupancies.notice(ctx, id, dto);
  }

  @Post(':id/close')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Clôturer (RG15) : caution, retenues, à rembourser' })
  async close(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(closeOccupancyDto)) dto: CloseOccupancyDto,
  ) {
    return this.occupancies.close(ctx, id, dto);
  }
}
