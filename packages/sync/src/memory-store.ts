import type {
  OutboxStore,
  PullPage,
  PullStore,
  PushResult,
  QueuedOperation,
  RejectedOperation,
} from './types';

/**
 * Stockage en mémoire, conforme aux contrats de `OutboxStore` et `PullStore`.
 * Sert aux tests du moteur et de référence pour l'implémentation SQLite de l'app.
 */
export class MemoryOutboxStore implements OutboxStore {
  private seq = 0;
  readonly queue: QueuedOperation[] = [];
  readonly toFix: RejectedOperation[] = [];
  readonly applied: Array<{ op: QueuedOperation; result: PushResult }> = [];

  async nextSeq(): Promise<number> {
    this.seq += 1;
    return this.seq;
  }

  async enqueue(op: QueuedOperation): Promise<void> {
    if (this.queue.some((q) => q.opId === op.opId)) return; // jamais deux fois le même opId
    this.queue.push({ ...op });
    this.queue.sort((a, b) => a.seq - b.seq);
  }

  async pending(limit: number): Promise<QueuedOperation[]> {
    return this.queue.slice(0, limit).map((op) => ({ ...op }));
  }

  async count(): Promise<number> {
    return this.queue.length;
  }

  async oldestCreatedAt(): Promise<string | null> {
    return this.queue[0]?.createdAt ?? null;
  }

  async markApplied(
    op: QueuedOperation,
    result: Extract<PushResult, { status: 'applied' | 'duplicate' }>,
  ): Promise<void> {
    this.remove(op.opId);
    this.applied.push({ op, result });
  }

  async moveToFix(rejected: RejectedOperation): Promise<void> {
    this.remove(rejected.op.opId);
    this.toFix.push(rejected);
  }

  async recordAttempt(opId: string, attempts: number, error: string): Promise<void> {
    const op = this.queue.find((q) => q.opId === opId);
    if (op) {
      op.attempts = attempts;
      op.lastError = error;
    }
  }

  private remove(opId: string): void {
    const index = this.queue.findIndex((q) => q.opId === opId);
    if (index >= 0) this.queue.splice(index, 1);
  }
}

export class MemoryPullStore implements PullStore {
  readonly cursors = new Map<string, string>();
  /** Lignes reçues, par site puis par table puis par id. */
  readonly rows = new Map<string, Map<string, Map<string, unknown>>>();

  async getCursor(siteId: string): Promise<string | null> {
    return this.cursors.get(siteId) ?? null;
  }

  async applyPage(siteId: string, page: PullPage): Promise<void> {
    const site = this.rows.get(siteId) ?? new Map<string, Map<string, unknown>>();
    for (const [table, list] of Object.entries(page.changes)) {
      const tableRows = site.get(table) ?? new Map<string, unknown>();
      for (const row of list) {
        const id = (row as { id?: unknown }).id;
        if (typeof id === 'string') tableRows.set(id, row);
      }
      site.set(table, tableRows);
    }
    for (const [table, ids] of Object.entries(page.tombstones)) {
      const tableRows = site.get(table);
      for (const id of ids) tableRows?.delete(id);
    }
    this.rows.set(siteId, site);
    this.cursors.set(siteId, page.cursor);
  }

  async reset(siteId: string): Promise<void> {
    this.rows.delete(siteId);
    this.cursors.delete(siteId);
  }
}
