import { getDatabase } from './database';

/**
 * Petites valeurs locales (table `meta`) : relances marquées envoyées sur ce téléphone…
 * Effacées avec la base à la déconnexion.
 */
export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
}

export async function metaWithPrefix(prefix: string): Promise<Map<string, string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM meta WHERE key LIKE ?',
    `${prefix}%`,
  );
  return new Map(rows.map((r) => [r.key, r.value]));
}
