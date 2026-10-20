import { z } from 'zod';
import { uuid } from './common';
import { AUDIT_ACTIONS, USER_ROLES, type AuditAction, type UserRole } from '../enums';

/**
 * DTO communs au module Administration — pagination par offset, filtres d'audit,
 * vue étendue des utilisateurs admin. Partagés entre l'API et le web pour éviter
 * la dérive entre les deux côtés.
 */

// ─── Pagination par offset (page / pageSize / total) ──────────────────────────
// Note : `common.ts` expose déjà une pagination par curseur (listes « charges »).
// L'admin a besoin d'une pagination page/pageSize pour l'audit et la liste des
// utilisateurs — les deux coexistent sans se marcher dessus.

export const offsetPaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OffsetPaginationQuery = z.infer<typeof offsetPaginationQuery>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

/** Actions considérées « sensibles » : annulation, suppression, archivage. */
export const SENSITIVE_AUDIT_ACTIONS: AuditAction[] = ['VOID', 'DELETE', 'ARCHIVE'];

export const auditFiltersQuery = offsetPaginationQuery.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  actorId: uuid.optional(),
  entity: z.string().min(1).max(60).optional(),
  entityId: uuid.optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  /** Vrai pour ne garder que les actions sensibles (VOID / DELETE / ARCHIVE). */
  sensitiveOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
});
export type AuditFiltersQuery = z.infer<typeof auditFiltersQuery>;

export interface AuditEntryView {
  id: string;
  createdAt: string;
  actorId: string;
  actorName: string | null;
  entity: string;
  entityId: string;
  action: AuditAction;
  reason: string | null;
  sensitive: boolean;
  before: unknown;
  after: unknown;
}

// ─── Liste des utilisateurs (côté admin) ──────────────────────────────────────

export const adminUserListQuery = offsetPaginationQuery.extend({
  search: z.string().trim().min(1).max(80).optional(),
  role: z.enum(USER_ROLES).optional(),
  active: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuery>;

export interface AdminSiteRef {
  id: string;
  name: string;
}

export interface AdminUserView {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  invitedAt: string | null;
  sites: AdminSiteRef[];
}

// ─── Vue d'ensemble du tableau de bord Admin ──────────────────────────────────

/**
 * Forme stable renvoyée par `GET /admin/overview`. Le LOT 0 remplit un
 * sous-ensemble minimal (role + compteurs de base) ; les champs manquants
 * sont ajoutés au LOT 1 sans rupture de contrat (les clients lisent défensivement).
 */
export interface AdminOverview {
  accountId: string;
  role: UserRole;
  readOnly: boolean;
  users: { active: number; inactive: number; total: number };
  anomaliesOpen: number;
  sensitiveActionsLast7Days: number;
  plan: {
    code: string;
    endsAt: string | null;
  };
}

// ─── Section d'onglets Admin (interface web) ──────────────────────────────────

export const ADMIN_SECTIONS = [
  'overview',
  'team',
  'audit',
  'settings',
  'subscription',
  'integrations',
  'data',
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];
