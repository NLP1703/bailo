import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  closeExitInspectionDto,
  createInspectionDto,
  type CloseExitInspectionDto,
  type CreateInspectionDto,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { InspectionsService } from './inspections.service';

@ApiTags('inspections')
@ApiBearerAuth()
@Controller('inspections')
export class InspectionsController {
  constructor(private readonly service: InspectionsService) {}

  @Get()
  list(@CurrentUser() ctx: RequestContext, @Query('occupancyId') occupancyId: string) {
    return this.service.listForOccupancy(ctx, occupancyId);
  }

  @Get('deposit-summary')
  depositSummary(@CurrentUser() ctx: RequestContext, @Query('occupancyId') occupancyId: string) {
    return this.service.depositSummary(ctx, occupancyId);
  }

  @Post()
  @Roles('OWNER', 'MANAGER', 'CARETAKER')
  create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createInspectionDto)) dto: CreateInspectionDto,
  ) {
    return this.service.create(ctx, dto);
  }

  @Post(':id/close')
  @Roles('OWNER', 'MANAGER')
  close(
    @CurrentUser() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeExitInspectionDto)) dto: CloseExitInspectionDto,
  ) {
    return this.service.closeExit(ctx, id, dto);
  }
}
