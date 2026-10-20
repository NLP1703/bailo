import { z } from 'zod';
import { email, password, phone, uuid } from './common';
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

/**
 * Filtres de lecture du journal d'audit (Lot 3).
 *
 * Pagination par curseur `before` (ISO datetime strict) : on charge les lignes
 * `createdAt < before`. Le serveur renvoie `nextCursor` = createdAt de la
 * dernière ligne. Préférée à l'offset pour un journal qui grossit en permanence
 * (pas de drift entre deux pages).
 */
export const auditFiltersQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  actorId: uuid.optional(),
  entity: z.string().min(1).max(60).optional(),
  entityId: uuid.optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  /** Vrai pour ne garder que les actions sensibles (VOID / DELETE / ARCHIVE
   *  + changement de rôle). */
  sensitiveOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
  /** Pagination : charge les lignes strictement antérieures à ce timestamp. */
  before: z.string().datetime().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
export type AuditFiltersQuery = z.infer<typeof auditFiltersQuery>;

export interface AuditEntryView {
  id: string;
  createdAt: string;
  actorId: string;
  actorName: string | null;
  entity: string;
  entityId: string;
  siteId: string | null;
  action: AuditAction;
  reason: string | null;
  sensitive: boolean;
  isRoleChange: boolean;
  before: unknown;
  after: unknown;
}

export interface AuditListResult {
  items: AuditEntryView[];
  /** createdAt ISO de la dernière ligne retournée, à repasser en `before`. Null = fin de liste. */
  nextCursor: string | null;
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

/** Mesure vs limite pour une jauge de quota (null = illimité pour ce plan). */
export interface AdminQuotaGauge {
  used: number;
  limit: number | null;
  /** Entier 0..100 ou null quand la jauge est illimitée. */
  pct: number | null;
}

/** Dernière connexion d'un membre de l'équipe (listée dans la vue d'ensemble). */
export interface AdminRecentLogin {
  userId: string;
  name: string;
  role: UserRole;
  lastLoginAt: string | null;
}

/** Résumé d'une action sensible pour la vue d'ensemble (lien profond vers /audit). */
export interface AdminSensitiveAction {
  id: string;
  createdAt: string;
  actorName: string | null;
  entity: string;
  entityId: string;
  action: AuditAction;
  /** Vrai lorsqu'un UPDATE sur `user` fait varier le champ `role`. */
  isRoleChange: boolean;
}

/** Anomalie ouverte (non résolue), triée par sévérité puis récence. */
export interface AdminOpenAnomaly {
  id: string;
  kind: string;
  severity: number;
  message: string;
  siteId: string | null;
  createdAt: string;
}

/**
 * Forme stable renvoyée par `GET /admin/overview`. Le LOT 0 posait un sous-
 * ensemble minimal ; le LOT 1 ajoute les jauges de quota, les listes courtes
 * et les détails d'actions sensibles. Les lots suivants ne retireront jamais
 * de champ — ils enrichiront, et les clients lisent défensivement.
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
  /** Jauges d'utilisation vs limite du plan (Lot 5 branchera `PlanLimit`). */
  quotas: {
    sites: AdminQuotaGauge;
    units: AdminQuotaGauge;
    users: AdminQuotaGauge;
  };
  /** 5 utilisateurs les plus récemment connectés (NULLS LAST). */
  recentLogins: AdminRecentLogin[];
  /** 5 actions sensibles (VOID, DELETE, ARCHIVE, changement de rôle) des 7 derniers jours. */
  recentSensitiveActions: AdminSensitiveAction[];
  /** 5 anomalies ouvertes les plus critiques. */
  openAnomalies: AdminOpenAnomaly[];
}

// ─── Création / mise à jour / invitation d'utilisateur (LOT 2) ───────────────
// Un OWNER peut créer directement un MANAGER ou CARETAKER, ou envoyer une
// invitation par OTP. Un OWNER supplémentaire ne peut être ajouté qu'en
// promotion depuis MANAGER (updateAdminUserDto), jamais à la création —
// garde-fou pour éviter des OWNER « surprises ».

const invitableRole = z.enum(['MANAGER', 'CARETAKER']);

export const createAdminUserDto = z.object({
  name: z.string().trim().min(2).max(80),
  email: email.optional(),
  phone,
  role: invitableRole,
  password,
  siteIds: z.array(uuid).default([]),
});
export type CreateAdminUserDto = z.infer<typeof createAdminUserDto>;

export const updateAdminUserDto = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    email: email.optional().nullable(),
    role: z.enum(USER_ROLES).optional(),
    active: z.boolean().optional(),
    siteIds: z.array(uuid).optional(),
  })
  .strict();
export type UpdateAdminUserDto = z.infer<typeof updateAdminUserDto>;

export const createInvitationDto = z.object({
  name: z.string().trim().min(2).max(80),
  email: email.optional(),
  phone,
  role: invitableRole,
  siteIds: z.array(uuid).default([]),
  /** Durée de validité en heures (1..168). Par défaut 72 h. */
  ttlHours: z.coerce.number().int().min(1).max(168).default(72),
});
export type CreateInvitationDto = z.infer<typeof createInvitationDto>;

export interface InvitationView {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: UserRole;
  siteIds: string[];
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  /** Jeton en clair, servi UNIQUEMENT à la création (jamais relu depuis la base). */
  token?: string;
  /** URL d'activation prête à partager, servie uniquement à la création. */
  acceptUrl?: string;
}

/** Codes d'erreur applicatifs pour les règles d'intégrité de l'équipe. */
export const ADMIN_USER_ERRORS = {
  LAST_OWNER: 'ADMIN_USER_LAST_OWNER',
  SELF_ROLE_CHANGE: 'ADMIN_USER_SELF_ROLE_CHANGE',
  SELF_DEACTIVATE: 'ADMIN_USER_SELF_DEACTIVATE',
  USER_NOT_FOUND: 'ADMIN_USER_NOT_FOUND',
  INVITATION_NOT_FOUND: 'ADMIN_INVITATION_NOT_FOUND',
} as const;

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
