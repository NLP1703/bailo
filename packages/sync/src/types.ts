/**
 * Types du protocole de synchronisation (apps/mobile/docs/02-protocole-synchronisation.md).
 * Ce paquet ne dépend d'aucune bibliothèque : il tourne aussi bien dans l'application
 * React Native que dans les tests Node.
 */

/** Une opération saisie sur le téléphone, telle qu'elle part au serveur (§ 3). */
export interface SyncOperation {
  /** UUID v4 créé sur le téléphone — clé d'idempotence (RGM1). */
  opId: string;
  /** Ordre de saisie sur ce téléphone, strictement croissant (RGM2). */
  seq: number;
  /** Type d'opération, par exemple `payment.create` (§ 4). */
  type: string;
  /** Version du format de cette opération (NFM14). */
  v: number;
  /** Site concerné (contrôle d'accès côté serveur). */
  siteId: string;
  /** Horloge du téléphone, ISO 8601 — affichage et contrôles. */
  createdAt: string;
  /** Contenu validé côté serveur par le schéma du type. */
  payload: unknown;
  /** Modifications de fiche seulement : version lue sur le téléphone (RGM9). */
  base?: { updatedAt: string };
}

/** Une opération en file d'attente sur le téléphone. */
export interface QueuedOperation extends SyncOperation {
  /** Nombre d'envois tentés sans réponse définitive. */
  attempts: number;
  /** Dernière erreur passagère, pour l'affichage. */
  lastError?: string;
}

/** Résultat renvoyé par le serveur pour une opération (§ 5). */
export type PushResult =
  | {
      opId: string;
      status: 'applied' | 'duplicate';
      entityId?: string;
      entity?: unknown;
      /** RGM9 : la fiche avait changé depuis la version lue. */
      overwritten?: boolean;
    }
  | { opId: string; status: 'rejected'; errorCode: string; message: string }
  | { opId: string; status: 'retry'; message?: string };

export interface PushRequest {
  deviceId: string;
  /** RGM7 : le serveur sait combien d'opérations attendent sur ce téléphone. */
  pendingCount: number;
  oldestPendingAt: string | null;
  ops: SyncOperation[];
}

export interface PushResponse {
  results: PushResult[];
}

/** Une opération refusée, gardée pour que l'utilisateur la reprenne (RGM6). */
export interface RejectedOperation {
  op: SyncOperation;
  errorCode: string;
  message: string;
  rejectedAt: string;
}

/** Une page de réception (§ 7). */
export interface PullPage {
  /** Lignes modifiées, par table locale. */
  changes: Record<string, unknown[]>;
  /** Suppressions définitives, par table locale. */
  tombstones: Record<string, string[]>;
  cursor: string;
  hasMore: boolean;
  /** Remise à zéro du compte côté serveur : tout recharger. */
  resetRequired?: boolean;
}

/** Stockage local de la file et des opérations refusées (SQLite dans l'app, mémoire en test). */
export interface OutboxStore {
  /** Prochain numéro de séquence ; ne revient jamais en arrière, même après redémarrage. */
  nextSeq(): Promise<number>;
  enqueue(op: QueuedOperation): Promise<void>;
  /** Les `limit` premières opérations en attente, par `seq` croissant. */
  pending(limit: number): Promise<QueuedOperation[]>;
  count(): Promise<number>;
  oldestCreatedAt(): Promise<string | null>;
  /** Opération appliquée par le serveur : la retirer et mettre à jour la base locale. */
  markApplied(
    op: QueuedOperation,
    result: Extract<PushResult, { status: 'applied' | 'duplicate' }>,
  ): Promise<void>;
  /** Opération refusée : la retirer de la file et la ranger dans « à corriger ». */
  moveToFix(rejected: RejectedOperation): Promise<void>;
  recordAttempt(opId: string, attempts: number, error: string): Promise<void>;
}

/** Stockage local des données reçues. */
export interface PullStore {
  getCursor(siteId: string): Promise<string | null>;
  /** Applique une page puis enregistre le curseur, dans une même transaction. */
  applyPage(siteId: string, page: PullPage): Promise<void>;
  /** Efface les données reçues d'un site (avant un rechargement complet). */
  reset(siteId: string): Promise<void>;
}

/** Accès réseau à l'API. Une erreur lancée signifie « pas de réponse » (réseau, 5xx). */
export interface SyncTransport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(siteId: string, cursor: string | null): Promise<PullPage>;
}

/** Planificateur injectable (setTimeout dans l'app, horloge simulée en test). */
export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type SyncPhase = 'idle' | 'pushing' | 'pulling' | 'offline';

export interface SyncState {
  phase: SyncPhase;
  pendingCount: number;
  lastSuccessAt: number | null;
  lastError: string | null;
  /** Heure de la prochaine tentative après un échec, ou null. */
  nextRetryAt: number | null;
}
