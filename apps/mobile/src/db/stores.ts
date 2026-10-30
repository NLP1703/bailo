import type {
  OutboxStore,
  PullPage,
  PullStore,
  PushResult,
  QueuedOperation,
  RejectedOperation,
  SyncOperation,
} from '@bailo/sync';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Toutes les écritures passent par cette file, une à la fois, sur la connexion principale.
 * `withExclusiveTransactionAsync` ouvrirait une seconde connexion qui ne reçoit pas la clé
 * SQLCipher (« file is not a database ») ; et une écriture lancée pendant une transaction
 * ouverte sur la même connexion en ferait partie, donc disparaîtrait avec elle en cas
 * d'annulation. D'où la sérialisation explicite.
 */
let writes: Promise<unknown> = Promise.resolve();

export function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = writes.then(work);
  writes = run.catch(() => undefined);
  return run;
}

function transaction(
  db: SQLiteDatabase,
  work: (txn: SQLiteDatabase) => Promise<void>,
): Promise<void> {
  return serialized(() => db.withTransactionAsync(() => work(db)));
}

/** Table locale où ranger l'entité renvoyée par le serveur après une création. */
const ENTITY_TABLE: Record<string, string> = {
  'payment.create': 'payments',
  'ticket.create': 'tickets',
  'expense.create': 'expenses',
  'meterReading.create': 'meter_readings',
  'cashHandover.create': 'cash_handovers',
};

interface OutboxRow {
  op_id: string;
  seq: number;
  type: string;
  v: number;
  site_id: string;
  created_at: string;
  payload: string;
  base: string | null;
  attempts: number;
  last_error: string | null;
}

function fromRow(row: OutboxRow): QueuedOperation {
  return {
    opId: row.op_id,
    seq: row.seq,
    type: row.type,
    v: row.v,
    siteId: row.site_id,
    createdAt: row.created_at,
    payload: JSON.parse(row.payload) as unknown,
    ...(row.base ? { base: JSON.parse(row.base) as { updatedAt: string } } : {}),
    attempts: row.attempts,
    ...(row.last_error ? { lastError: row.last_error } : {}),
  };
}

/** File d'opérations dans SQLite : même contrat que `MemoryOutboxStore` (testé dans @bailo/sync). */
export class SqliteOutboxStore implements OutboxStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async nextSeq(): Promise<number> {
    const row = await serialized(() =>
      this.db.getFirstAsync<{ value: string }>(
        `INSERT INTO meta (key, value) VALUES ('seq', '1')
         ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1
         RETURNING value`,
      ),
    );
    return Number(row?.value ?? 1);
  }

  async enqueue(op: QueuedOperation): Promise<void> {
    await serialized(() =>
      this.db.runAsync(
        `INSERT OR IGNORE INTO outbox (op_id, seq, type, v, site_id, created_at, payload, base, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        op.opId,
        op.seq,
        op.type,
        op.v,
        op.siteId,
        op.createdAt,
        JSON.stringify(op.payload ?? null),
        op.base ? JSON.stringify(op.base) : null,
      ),
    );
  }

  async pending(limit: number): Promise<QueuedOperation[]> {
    const rows = await this.db.getAllAsync<OutboxRow>(
      'SELECT * FROM outbox ORDER BY seq ASC LIMIT ?',
      limit,
    );
    return rows.map(fromRow);
  }

  async count(): Promise<number> {
    const row = await this.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
    return row?.n ?? 0;
  }

  async oldestCreatedAt(): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ created_at: string }>(
      'SELECT created_at FROM outbox ORDER BY seq ASC LIMIT 1',
    );
    return row?.created_at ?? null;
  }

  async markApplied(
    op: QueuedOperation,
    result: Extract<PushResult, { status: 'applied' | 'duplicate' }>,
  ): Promise<void> {
    const table = ENTITY_TABLE[op.type];
    const entity = result.entity as { id?: unknown } | undefined;
    await transaction(this.db, async (txn) => {
      await txn.runAsync('DELETE FROM outbox WHERE op_id = ?', op.opId);
      if (table && entity && typeof entity.id === 'string') {
        await txn.runAsync(
          'INSERT OR REPLACE INTO records (tbl, id, site_id, data) VALUES (?, ?, ?, ?)',
          table,
          entity.id,
          op.siteId,
          JSON.stringify(entity),
        );
      }
    });
  }

  async moveToFix(rejected: RejectedOperation): Promise<void> {
    await transaction(this.db, async (txn) => {
      await txn.runAsync('DELETE FROM outbox WHERE op_id = ?', rejected.op.opId);
      await txn.runAsync(
        `INSERT OR REPLACE INTO to_fix (op_id, op, error_code, message, rejected_at)
         VALUES (?, ?, ?, ?, ?)`,
        rejected.op.opId,
        JSON.stringify(rejected.op),
        rejected.errorCode,
        rejected.message,
        rejected.rejectedAt,
      );
    });
  }

  async recordAttempt(opId: string, attempts: number, error: string): Promise<void> {
    await serialized(() =>
      this.db.runAsync(
        'UPDATE outbox SET attempts = ?, last_error = ? WHERE op_id = ?',
        attempts,
        error,
        opId,
      ),
    );
  }

  /** L'utilisateur a refait ou abandonné une opération refusée (RGM6). */
  async removeToFix(opId: string): Promise<void> {
    await serialized(() => this.db.runAsync('DELETE FROM to_fix WHERE op_id = ?', opId));
  }

  /** Opérations refusées, pour l'écran « À corriger » (RGM6). */
  async listToFix(): Promise<RejectedOperation[]> {
    const rows = await this.db.getAllAsync<{
      op: string;
      error_code: string;
      message: string;
      rejected_at: string;
    }>('SELECT op, error_code, message, rejected_at FROM to_fix ORDER BY rejected_at DESC');
    return rows.map((r) => ({
      op: JSON.parse(r.op) as SyncOperation,
      errorCode: r.error_code,
      message: r.message,
      rejectedAt: r.rejected_at,
    }));
  }
}

/** Données reçues du serveur, rangées par table et par site. */
export class SqlitePullStore implements PullStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async getCursor(siteId: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ cursor: string }>(
      'SELECT cursor FROM cursors WHERE site_id = ?',
      siteId,
    );
    return row?.cursor ?? null;
  }

  async applyPage(siteId: string, page: PullPage): Promise<void> {
    await transaction(this.db, async (txn) => {
      for (const [table, rows] of Object.entries(page.changes)) {
        for (const row of rows) {
          const id = (row as { id?: unknown }).id;
          if (typeof id !== 'string') continue;
          await txn.runAsync(
            'INSERT OR REPLACE INTO records (tbl, id, site_id, data) VALUES (?, ?, ?, ?)',
            table,
            id,
            siteId,
            JSON.stringify(row),
          );
        }
      }
      for (const [table, ids] of Object.entries(page.tombstones)) {
        for (const id of ids) {
          await txn.runAsync('DELETE FROM records WHERE tbl = ? AND id = ?', table, id);
        }
      }
      await txn.runAsync(
        'INSERT OR REPLACE INTO cursors (site_id, cursor) VALUES (?, ?)',
        siteId,
        page.cursor,
      );
    });
  }

  async reset(siteId: string): Promise<void> {
    await transaction(this.db, async (txn) => {
      await txn.runAsync('DELETE FROM records WHERE site_id = ?', siteId);
      await txn.runAsync('DELETE FROM cursors WHERE site_id = ?', siteId);
    });
  }

  /** Lecture locale d'une table pour un site (écrans hors-ligne). */
  async list<T>(siteId: string, table: string): Promise<T[]> {
    const rows = await this.db.getAllAsync<{ data: string }>(
      'SELECT data FROM records WHERE site_id = ? AND tbl = ?',
      siteId,
      table,
    );
    return rows.map((r) => JSON.parse(r.data) as T);
  }
}
