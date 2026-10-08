import { z } from 'zod';
import { uuid, locale } from './common';
import { TEMPLATE_KINDS, REMINDER_STAGES } from '../enums';

export const upsertTemplateDto = z.object({
  id: uuid.optional(),
  kind: z.enum(TEMPLATE_KINDS),
  name: z.string().min(1),
  locale,
  stage: z.enum(REMINDER_STAGES).optional(), // pour les modèles de relance
  bodyHtml: z.string().min(1),
  isDefault: z.boolean().default(false),
});
export type UpsertTemplateDto = z.infer<typeof upsertTemplateDto>;

export const listTemplatesQuery = z.object({
  kind: z.enum(TEMPLATE_KINDS).optional(),
  locale: locale.optional(),
});
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuery>;
