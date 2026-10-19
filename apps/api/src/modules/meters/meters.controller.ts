import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createMeterDto,
  readingsQuery,
  recordReadingDto,
  updateMeterDto,
  type CreateMeterDto,
  type ReadingsQuery,
  type RecordReadingDto,
  type UpdateMeterDto,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { MetersService } from './meters.service';

@ApiTags('meters')
@ApiBearerAuth()
@Controller('meters')
export class MetersController {
  constructor(private readonly service: MetersService) {}

  @Get()
  readings(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(readingsQuery)) q: ReadingsQuery,
  ) {
    return this.service.readings(ctx, q);
  }

  @Get('for-unit/:unitId')
  listForUnit(@CurrentUser() ctx: RequestContext, @Param('unitId') unitId: string) {
    return this.service.listForUnit(ctx, unitId);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createMeterDto)) dto: CreateMeterDto,
  ) {
    return this.service.create(ctx, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  update(
    @CurrentUser() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMeterDto)) dto: UpdateMeterDto,
  ) {
    return this.service.update(ctx, id, dto);
  }

  @Post('readings')
  @Roles('OWNER', 'MANAGER', 'CARETAKER')
  record(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(recordReadingDto)) dto: RecordReadingDto,
  ) {
    return this.service.recordReading(ctx, dto);
  }
}
