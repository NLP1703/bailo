import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  markReminderSentDto,
  remindersHistoryQuery,
  remindersTodayQuery,
  uuid,
  type MarkReminderSentDto,
  type RemindersHistoryQuery,
  type RemindersTodayQuery,
} from '@citegest/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@ApiBearerAuth()
@Controller('reminders')
@Roles('OWNER', 'MANAGER')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('today')
  @ApiOperation({ summary: 'Relances du jour par palier (J-3, J0, J+5, J+15)' })
  async today(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(remindersTodayQuery)) query: RemindersTodayQuery,
  ) {
    return this.reminders.today(ctx, query);
  }

  @Get()
  @ApiOperation({ summary: 'Historique des relances envoyées' })
  async history(@Query(new ZodValidationPipe(remindersHistoryQuery)) query: RemindersHistoryQuery) {
    return this.reminders.history(query);
  }

  @Get(':id/wa-link')
  @ApiOperation({ summary: 'Lien wa.me pré-rempli' })
  async waLink(@Param('id', new ZodValidationPipe(uuid)) id: string) {
    return this.reminders.waLink(id);
  }

  @Post(':id/sent')
  @ApiOperation({ summary: 'Marquer une relance comme envoyée' })
  async markSent(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(markReminderSentDto)) dto: MarkReminderSentDto,
  ) {
    return this.reminders.markSent(ctx, id, dto);
  }
}
