import { z } from 'zod';
import { createHandoverDto } from './cash';
import { uuid } from './common';
import { createExpenseDto } from './expenses';
import { createTicketDto } from './maintenance';
import { recordReadingDto } from './meters';
import { createOccupancyDto } from './occupancies';
import { createPaymentDto } from './payments';
import { createTenantDto } from './tenants';

const isoDateTime = z.string().datetime({ offset: true });

/**
 * Ancien format de la file hors-ligne (site web) : paiements seulement, idempotents par
 * `clientId`. `strict()` : un corps du nouveau format ne doit jamais tomber ici par erreur.
 */
export const legacySyncPushDto = z
  .object({
    payments: z.array(createPaymentDto).default([]),
  })
  .strict();
export type LegacySyncPushDto = z.infer<typeof legacySyncPushDto>;

// ─── Protocole mobile (apps/mobile/docs/02-protocole-synchronisation.md) ─────

/** Types d'opérations saisissables hors-ligne pris en charge par ce serveur (§ 4). */
export const SYNC_OPERATION_TYPES = [
  'payment.create',
  'meterReading.create',
  'ticket.create',
  'expense.create',
  'cashHandover.create',
  'tenant.create',
  'occupancy.create',
  'attachment.link',
] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

/**
 * Rattache une photo déjà déposée (§ 6) à l'élément créé par une autre opération du
 * téléphone, désignée par son `opId` : l'élément peut avoir été créé hors-ligne.
 */
export const attachmentLinkDto = z.object({
  targetOpId: uuid,
  key: z.string().min(1).max(512),
});
export type AttachmentLinkDto = z.infer<typeof attachmentLinkDto>;

/**
 * Nouvelle entrée créée depuis le téléphone (T6). Le locataire vient d'une opération
 * `tenant.create` du même lot, pas encore connue du serveur : on le désigne par son
 * `opId` (`tenantOpId`), que le serveur résout en identifiant une fois le locataire créé
 * — même mécanisme que `attachment.link`.
 */
export const syncOccupancyDto = createOccupancyDto
  .omit({ tenantId: true, clientId: true })
  .extend({ tenantOpId: uuid });
export type SyncOccupancyDto = z.infer<typeof syncOccupancyDto>;

/** Usage de fichier attendu pour chaque type d'élément auquel une photo se rattache. */
export const ATTACHMENT_PURPOSE: Record<string, string> = {
  'payment.create': 'payment-proof',
  'meterReading.create': 'meter-photo',
  'ticket.create': 'ticket-photo',
  'expense.create': 'expense-proof',
  'tenant.create': 'tenant-id',
};

/** Contenu attendu pour chaque type (version 1). Le site vient de l'opération elle-même. */
export const SYNC_PAYLOAD_SCHEMAS = {
  'payment.create': createPaymentDto.omit({ clientId: true }),
  'meterReading.create': recordReadingDto,
  'ticket.create': createTicketDto.omit({ siteId: true }),
  'expense.create': createExpenseDto.omit({ siteId: true }),
  'cashHandover.create': createHandoverDto,
  'tenant.create': createTenantDto,
  'occupancy.create': syncOccupancyDto,
  'attachment.link': attachmentLinkDto,
} as const satisfies Record<SyncOperationType, z.ZodTypeAny>;

export const syncOperationDto = z.object({
  opId: uuid,
  seq: z.number().int().min(1),
  type: z.string().min(1).max(60),
  v: z.number().int().min(1).max(100),
  siteId: uuid,
  createdAt: isoDateTime,
  payload: z.unknown(),
  base: z.object({ updatedAt: isoDateTime }).optional(),
});
export type SyncOperationDto = z.infer<typeof syncOperationDto>;

export const mobileSyncPushDto = z.object({
  deviceId: uuid,
  pendingCount: z.number().int().min(0),
  oldestPendingAt: isoDateTime.nullable(),
  ops: z.array(syncOperationDto).max(50),
});
export type MobileSyncPushDto = z.infer<typeof mobileSyncPushDto>;

/** `/sync/push` accepte les deux formats : mobile (opérations) ou web (paiements). */
export const syncPushDto = z.union([mobileSyncPushDto, legacySyncPushDto]);
export type SyncPushDto = z.infer<typeof syncPushDto>;

export type SyncOpResult =
  | {
      opId: string;
      status: 'applied' | 'duplicate';
      entityId?: string;
      entity?: unknown;
      overwritten?: boolean;
    }
  | { opId: string; status: 'rejected'; errorCode: string; message: string }
  | { opId: string; status: 'retry'; message?: string };

/** Codes de refus d'une opération (§ 5). */
export const SYNC_ERRORS = {
  UNSUPPORTED_OPERATION: 'SYNC_UNSUPPORTED_OPERATION',
  INVALID_PAYLOAD: 'SYNC_INVALID_PAYLOAD',
  FORBIDDEN: 'SYNC_FORBIDDEN',
  SITE_FORBIDDEN: 'SYNC_SITE_FORBIDDEN',
  SITE_MISMATCH: 'SYNC_SITE_MISMATCH',
  READ_ONLY: 'SYNC_ACCOUNT_READ_ONLY',
  DATE_OUT_OF_RANGE: 'SYNC_DATE_OUT_OF_RANGE',
  NOT_FOUND: 'SYNC_NOT_FOUND',
  BUSINESS_RULE: 'SYNC_BUSINESS_RULE',
  OP_ID_CONFLICT: 'SYNC_OP_ID_CONFLICT',
  NEEDS_REVIEW: 'SYNC_NEEDS_REVIEW',
  DEVICE_REVOKED: 'SYNC_DEVICE_REVOKED',
  DEVICE_UNKNOWN: 'SYNC_DEVICE_UNKNOWN',
} as const;

/**
 * Réception. Sans `siteId` : ancien instantané du compte (site web). Avec `siteId` :
 * changements du site depuis `cursor`, page par page (§ 7).
 */
export const syncPullQuery = z.object({
  since: isoDateTime.optional(),
  siteId: uuid.optional(),
  cursor: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});
export type SyncPullQuery = z.infer<typeof syncPullQuery>;

export interface SyncPullPage {
  changes: Record<string, unknown[]>;
  tombstones: Record<string, string[]>;
  cursor: string;
  hasMore: boolean;
  resetRequired?: boolean;
}

// ─── Appareils (RGM10 à RGM12) ─────────────────────────────────────────────

/** Deux appareils actifs au plus par compte utilisateur (RGM10). */
export const MAX_ACTIVE_DEVICES = 2;

export const registerDeviceDto = z.object({
  deviceId: uuid,
  platform: z.enum(['android', 'ios', 'web']),
  appVersion: z.string().max(20).optional(),
  model: z.string().max(80).optional(),
  /** Appareil à déconnecter pour faire de la place (limite de 2 atteinte). */
  replaceDeviceId: uuid.optional(),
});
export type RegisterDeviceDto = z.infer<typeof registerDeviceDto>;

export interface DeviceView {
  id: string;
  deviceId: string;
  userId: string;
  userName: string;
  platform: string;
  model: string | null;
  appVersion: string | null;
  lastSeenAt: string;
  pendingCount: number;
  oldestPendingAt: string | null;
  revokedAt: string | null;
}

export const DEVICE_ERRORS = {
  LIMIT_REACHED: 'DEVICE_LIMIT_REACHED',
  NOT_FOUND: 'DEVICE_NOT_FOUND',
} as const;
