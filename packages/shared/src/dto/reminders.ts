import { z } from 'zod';
import { uuid, locale, optionalPaginationQuery } from './common';
import { REMINDER_RECIPIENTS, REMINDER_CHANNELS } from '../enums';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const remindersTodayQuery = z.object({
  date: isoDate.optional(), // défaut : aujourd'hui (utile pour tests / rattrapage)
  siteId: uuid.optional(),
  locale: locale.optional(),
});
export type RemindersTodayQuery = z.infer<typeof remindersTodayQuery>;

export const markReminderSentDto = z.object({
  recipient: z.enum(REMINDER_RECIPIENTS).optional(),
  channel: z.enum(REMINDER_CHANNELS).optional(),
});
export type MarkReminderSentDto = z.infer<typeof markReminderSentDto>;

export const remindersHistoryQuery = z.object({
  tenantId: uuid.optional(),
})
  .merge(optionalPaginationQuery);
export type RemindersHistoryQuery = z.infer<typeof remindersHistoryQuery>;
