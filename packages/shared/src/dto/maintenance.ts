// Tickets de maintenance.
import { z } from 'zod';
import { uuid } from './common';
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from '../enums';

export const createTicketDto = z.object({
  siteId: uuid,
  unitId: uuid.optional(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(MAINTENANCE_PRIORITIES).default('NORMAL'),
  photoKeys: z.array(z.string()).default([]),
});
export type CreateTicketDto = z.infer<typeof createTicketDto>;

export const updateTicketDto = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  priority: z.enum(MAINTENANCE_PRIORITIES).optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  assignedTo: z.string().max(120).optional(),
  assignedPhone: z.string().max(30).optional(),
  photoKeys: z.array(z.string()).optional(),
});
export type UpdateTicketDto = z.infer<typeof updateTicketDto>;

export const resolveTicketDto = z.object({
  cost: z.number().int().min(0),
  note: z.string().max(1000).optional(),
  /** Si vrai, créer automatiquement une dépense "MAINTENANCE" liée au ticket. */
  createExpense: z.boolean().default(true),
});
export type ResolveTicketDto = z.infer<typeof resolveTicketDto>;

export const ticketListQuery = z.object({
  siteId: uuid.optional(),
  unitId: uuid.optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  priority: z.enum(MAINTENANCE_PRIORITIES).optional(),
});
export type TicketListQuery = z.infer<typeof ticketListQuery>;
