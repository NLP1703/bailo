import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createTicketDto,
  resolveTicketDto,
  ticketListQuery,
  updateTicketDto,
  type CreateTicketDto,
  type ResolveTicketDto,
  type TicketListQuery,
  type UpdateTicketDto,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { MaintenanceService } from './maintenance.service';

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  @Get()
  list(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(ticketListQuery)) q: TicketListQuery,
  ) {
    return this.service.list(ctx, q);
  }

  @Post()
  @Roles('OWNER', 'MANAGER', 'CARETAKER')
  create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createTicketDto)) dto: CreateTicketDto,
  ) {
    return this.service.create(ctx, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  update(
    @CurrentUser() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTicketDto)) dto: UpdateTicketDto,
  ) {
    return this.service.update(ctx, id, dto);
  }

  @Post(':id/resolve')
  @Roles('OWNER', 'MANAGER')
  resolve(
    @CurrentUser() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveTicketDto)) dto: ResolveTicketDto,
  ) {
    return this.service.resolve(ctx, id, dto);
  }
}
