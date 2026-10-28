import type {
  OutboxStore,
  PullStore,
  PushResult,
  QueuedOperation,
  Scheduler,
  SyncOperation,
  SyncState,
  SyncTransport,
} from './types';

/** Attentes entre deux tentatives après un échec réseau (§ 5 : 5 s, 15 s, 1 min, puis 5 min). */
export const DEFAULT_BACKOFF_MS = [5_000, 15_000, 60_000, 300_000] as const;

/** Taille maximale d'un lot envoyé (§ 5). */
export const MAX_BATCH = 50;

/** Nombre maximal de pages reçues d'affilée, pour ne jamais boucler sans fin. */
export const MAX_PULL_PAGES = 200;

export interface EnqueueInput {
  type: string;
  v?: number;
  siteId: string;
  payload: unknown;
  base?: { updatedAt: string };
  /** Pour un paiement, l'`opId` est le `clientId` déjà connu du serveur. */
  opId?: string;
}

export interface SyncEngineOptions {
  outbox: OutboxStore;
  pullStore: PullStore;
  transport: SyncTransport;
  deviceId: string;
  /** Générateur d'UUID v4 (expo-crypto dans l'app, node:crypto en test). */
  uuid: () => string;
  scheduler?: Scheduler;
  batchSize?: number;
  backoffMs?: readonly number[];
}

export interface FlushReport {
  sent: number;
  applied: number;
  rejected: number;
  /** true si l'envoi s'est arrêté sur une erreur (réseau ou `retry`). */
  interrupted: boolean;
}

const realScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type Listener = (state: SyncState) => void;

/**
 * Moteur de synchronisation : file d'opérations idempotentes envoyées dans l'ordre de
 * saisie, puis réception incrémentale des données.
 *
 * Garanties (testées dans __tests__/engine.test.ts) :
 *  - une opération n'est retirée de la file qu'après une réponse définitive du serveur
 *    (`applied`, `duplicate` ou `rejected`) : rien ne se perd (RGM2, RGM6) ;
 *  - l'ordre de `seq` est respecté : sur une erreur passagère, l'envoi s'arrête et
 *    reprendra à cette opération (RGM2) ;
 *  - un seul envoi à la fois, même si plusieurs déclencheurs arrivent ensemble ;
 *  - le renvoi d'un lot déjà appliqué est sans effet grâce à l'`opId` (RGM1, côté serveur).
 */
export class SyncEngine {
  private readonly scheduler: Scheduler;
  private readonly batchSize: number;
  private readonly backoffMs: readonly number[];
  private readonly listeners = new Set<Listener>();

  private flushing: Promise<FlushReport> | null = null;
  private flushAgain = false;
  private failures = 0;
  private retryHandle: unknown = null;

  private state: SyncState = {
    phase: 'idle',
    pendingCount: 0,
    lastSuccessAt: null,
    lastError: null,
    nextRetryAt: null,
  };

  constructor(private readonly opts: SyncEngineOptions) {
    this.scheduler = opts.scheduler ?? realScheduler;
    this.batchSize = Math.min(opts.batchSize ?? MAX_BATCH, MAX_BATCH);
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  }

  // ─── État observable ─────────────────────────────────────────────────────

  getState(): SyncState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  async refreshPendingCount(): Promise<number> {
    const pendingCount = await this.opts.outbox.count();
    this.setState({ pendingCount });
    return pendingCount;
  }

  // ─── Saisie ──────────────────────────────────────────────────────────────

  /**
   * Met une opération en file. Elle est enregistrée localement AVANT tout envoi :
   * si l'application est tuée juste après, l'opération est toujours là au redémarrage.
   */
  async enqueue(input: EnqueueInput): Promise<SyncOperation> {
    const op: QueuedOperation = {
      opId: input.opId ?? this.opts.uuid(),
      seq: await this.opts.outbox.nextSeq(),
      type: input.type,
      v: input.v ?? 1,
      siteId: input.siteId,
      createdAt: new Date(this.scheduler.now()).toISOString(),
      payload: input.payload,
      ...(input.base ? { base: input.base } : {}),
      attempts: 0,
    };
    await this.opts.outbox.enqueue(op);
    await this.refreshPendingCount();
    return stripQueueFields(op);
  }

  // ─── Envoi ───────────────────────────────────────────────────────────────

  /**
   * Envoie la file. Si un envoi est déjà en cours, attend sa fin puis relance une passe
   * (pour prendre les opérations ajoutées entre-temps). Ne lance jamais d'exception :
   * un échec réseau programme une nouvelle tentative.
   */
  flush(): Promise<FlushReport> {
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    this.cancelRetry();
    this.flushing = this.runFlushLoop().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async runFlushLoop(): Promise<FlushReport> {
    const total: FlushReport = { sent: 0, applied: 0, rejected: 0, interrupted: false };
    do {
      this.flushAgain = false;
      const report = await this.flushBatches();
      total.sent += report.sent;
      total.applied += report.applied;
      total.rejected += report.rejected;
      total.interrupted = report.interrupted;
      if (report.interrupted) break;
    } while (this.flushAgain);
    return total;
  }

  private async flushBatches(): Promise<FlushReport> {
    const report: FlushReport = { sent: 0, applied: 0, rejected: 0, interrupted: false };
    for (;;) {
      const batch = await this.opts.outbox.pending(this.batchSize);
      if (batch.length === 0) break;

      this.setState({ phase: 'pushing' });
      const pendingCount = await this.opts.outbox.count();
      const oldestPendingAt = await this.opts.outbox.oldestCreatedAt();

      let results: PushResult[];
      try {
        const response = await this.opts.transport.push({
          deviceId: this.opts.deviceId,
          pendingCount,
          oldestPendingAt,
          ops: batch.map(stripQueueFields),
        });
        results = Array.isArray(response?.results) ? response.results : [];
      } catch (error) {
        await this.noteFailure(batch, errorMessage(error));
        report.interrupted = true;
        break;
      }

      report.sent += batch.length;
      const byId = new Map(results.map((r) => [r.opId, r]));
      let stoppedAt: QueuedOperation | null = null;
      let stopMessage = '';

      // Les résultats sont lus dans l'ordre de la file, jamais dans celui de la réponse.
      for (const op of batch) {
        const result = byId.get(op.opId);
        if (!result || result.status === 'retry') {
          stoppedAt = op;
          stopMessage =
            result?.status === 'retry' ? (result.message ?? 'retry') : 'Réponse incomplète';
          break;
        }
        if (result.status === 'applied' || result.status === 'duplicate') {
          await this.opts.outbox.markApplied(op, result);
          report.applied += 1;
        } else if (result.status === 'rejected') {
          await this.opts.outbox.moveToFix({
            op: stripQueueFields(op),
            errorCode: result.errorCode,
            message: result.message,
            rejectedAt: new Date(this.scheduler.now()).toISOString(),
          });
          report.rejected += 1;
        }
      }

      await this.refreshPendingCount();
      if (stoppedAt) {
        await this.noteFailure([stoppedAt], stopMessage);
        report.interrupted = true;
        break;
      }
      this.failures = 0;
      this.setState({ lastError: null, nextRetryAt: null });
      if (batch.length < this.batchSize) break;
    }

    if (!report.interrupted) {
      this.setState({
        phase: 'idle',
        ...(report.sent > 0 ? { lastSuccessAt: this.scheduler.now() } : {}),
      });
    }
    return report;
  }

  private async noteFailure(ops: QueuedOperation[], message: string): Promise<void> {
    const first = ops[0];
    if (first) await this.opts.outbox.recordAttempt(first.opId, first.attempts + 1, message);
    this.failures += 1;
    const delay = this.backoffMs[Math.min(this.failures - 1, this.backoffMs.length - 1)] ?? 300_000;
    const nextRetryAt = this.scheduler.now() + delay;
    this.setState({ phase: 'offline', lastError: message, nextRetryAt });
    this.retryHandle = this.scheduler.setTimeout(() => {
      this.retryHandle = null;
      void this.flush();
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryHandle !== null) {
      this.scheduler.clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
  }

  /** Arrête les tentatives programmées (déconnexion, application en arrière-plan). */
  stop(): void {
    this.cancelRetry();
  }

  // ─── Réception ───────────────────────────────────────────────────────────

  /**
   * Reçoit les changements d'un site depuis le dernier curseur, page par page.
   * Le curseur n'avance qu'une fois la page appliquée : une coupure ne fait rien perdre.
   * Renvoie false si le réseau a manqué.
   */
  async pull(siteId: string): Promise<boolean> {
    this.setState({ phase: 'pulling' });
    try {
      let cursor = await this.opts.pullStore.getCursor(siteId);
      for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
        const result = await this.opts.transport.pull(siteId, cursor);
        if (result.resetRequired) {
          await this.opts.pullStore.reset(siteId);
          cursor = null;
          continue;
        }
        await this.opts.pullStore.applyPage(siteId, result);
        cursor = result.cursor;
        if (!result.hasMore) break;
      }
      this.setState({ phase: 'idle', lastSuccessAt: this.scheduler.now(), lastError: null });
      return true;
    } catch (error) {
      this.setState({ phase: 'offline', lastError: errorMessage(error) });
      return false;
    }
  }

  /** Envoi puis réception : ce qui est fait à l'ouverture, au retour du réseau et toutes les 15 min (RGM5). */
  async syncNow(siteId: string): Promise<FlushReport & { pulled: boolean }> {
    const report = await this.flush();
    const pulled = report.interrupted ? false : await this.pull(siteId);
    return { ...report, pulled };
  }
}

function stripQueueFields(op: QueuedOperation): SyncOperation {
  const { attempts: _attempts, lastError: _lastError, ...rest } = op;
  return rest;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
