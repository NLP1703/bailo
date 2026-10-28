import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { getSecret, setSecret } from '../lib/secure';

const DB_NAME = 'bailo.db';
const SCHEMA_VERSION = 1;

let current: Promise<SQLite.SQLiteDatabase> | null = null;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clé de chiffrement de la base : aléatoire, gardée dans le trousseau (NFM7). */
async function databaseKey(): Promise<string> {
  const existing = await getSecret('dbKey');
  if (existing) return existing;
  const key = toHex(await Crypto.getRandomBytesAsync(32));
  await setSecret('dbKey', key);
  return key;
}

/**
 * Base locale chiffrée avec SQLCipher (décision D3). Dans Expo Go, SQLCipher n'existe pas :
 * en développement la base reste en clair avec un avertissement ; une version de
 * production sans chiffrement refuse de démarrer.
 */
async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  if (cipher) {
    const key = await databaseKey(); // hexadécimal : aucune apostrophe possible
    await db.execAsync(`PRAGMA key = '${key}'`);
  } else if (__DEV__) {
    console.warn(
      'SQLCipher absent (Expo Go) : base locale NON chiffrée, développement uniquement.',
    );
  } else {
    await db.closeAsync();
    throw new Error('Chiffrement de la base indisponible : version de l’application invalide.');
  }
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox (
      op_id TEXT PRIMARY KEY NOT NULL,
      seq INTEGER NOT NULL UNIQUE,
      type TEXT NOT NULL,
      v INTEGER NOT NULL,
      site_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      base TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS to_fix (
      op_id TEXT PRIMARY KEY NOT NULL,
      op TEXT NOT NULL,
      error_code TEXT NOT NULL,
      message TEXT NOT NULL,
      rejected_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      tbl TEXT NOT NULL,
      id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (tbl, id)
    );
    CREATE INDEX IF NOT EXISTS records_site ON records (site_id, tbl);
    CREATE TABLE IF NOT EXISTS cursors (site_id TEXT PRIMARY KEY NOT NULL, cursor TEXT NOT NULL);
    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  current ??= open().catch((error: unknown) => {
    current = null;
    throw error;
  });
  return current;
}

/** Efface la base locale (déconnexion de l'appareil, RGM12). */
export async function deleteDatabase(): Promise<void> {
  if (current) {
    const db = await current.catch(() => null);
    current = null;
    await db?.closeAsync().catch(() => undefined);
  }
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => undefined);
}
