import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getDatabase } from '../db/database';
import { serialized } from '../db/stores';
import { api } from '../lib/api';
import { getSync } from './engine';

/** Usages photo des saisies de terrain (mêmes valeurs que FILE_PURPOSES côté serveur). */
export type PhotoPurpose = 'payment-proof' | 'meter-photo' | 'ticket-photo' | 'expense-proof';

/** Photo prise, avant compression. */
export interface Shot {
  uri: string;
  width: number;
  height: number;
}

/** § 6 : 1280 px au plus sur le grand côté, JPEG sous 300 Ko (NFM4). */
const MAX_SIDE = 1280;
const TARGET_BYTES = 300_000;
const QUALITIES = [0.7, 0.5, 0.35];

function uploadsDir(): Directory {
  const dir = new Directory(Paths.document, 'uploads');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function compress(shot: Shot): Promise<string> {
  let last = shot.uri;
  for (const quality of QUALITIES) {
    const context = ImageManipulator.manipulate(shot.uri);
    if (Math.max(shot.width, shot.height) > MAX_SIDE) {
      context.resize(shot.width >= shot.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    last = saved.uri;
    if (new File(saved.uri).size <= TARGET_BYTES) break;
  }
  return last;
}

/**
 * Range une photo à envoyer pour la saisie `targetOpId`. La saisie, elle, est déjà en
 * file : une photo ne bloque jamais une opération d'argent (§ 6).
 */
export async function queuePhoto(input: {
  targetOpId: string;
  siteId: string;
  purpose: PhotoPurpose;
  shot: Shot;
}): Promise<void> {
  const compressed = await compress(input.shot);
  const id = Crypto.randomUUID();
  const destination = new File(uploadsDir(), `${id}.jpg`);
  await new File(compressed).move(destination);
  const db = await getDatabase();
  await serialized(() =>
    db.runAsync(
      `INSERT INTO uploads (id, target_op_id, site_id, purpose, uri, status, attempts, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`,
      id,
      input.targetOpId,
      input.siteId,
      input.purpose,
      destination.uri,
      new Date().toISOString(),
    ),
  );
  void processUploads();
}

/** Les photos partent après la saisie, sans la retarder ni la bloquer (§ 6). */
export function queueShots(
  targetOpId: string,
  siteId: string,
  purpose: PhotoPurpose,
  shots: Shot[],
): void {
  for (const shot of shots) {
    void queuePhoto({ targetOpId, siteId, purpose, shot }).catch(() => undefined);
  }
}

interface UploadRow {
  id: string;
  target_op_id: string;
  site_id: string;
  purpose: PhotoPurpose;
  uri: string;
  attempts: number;
}

let running: Promise<number> | null = null;

/**
 * Envoie les photos en attente : URL signée, dépôt direct, puis opération
 * `attachment.link` mise en file (elle part après la saisie qu'elle complète).
 * Une seule passe à la fois ; s'arrête au premier problème de réseau.
 */
export function processUploads(): Promise<number> {
  running ??= (async () => {
    const db = await getDatabase();
    const rows = await db.getAllAsync<UploadRow>(
      "SELECT id, target_op_id, site_id, purpose, uri, attempts FROM uploads WHERE status = 'pending' ORDER BY created_at",
    );
    let sent = 0;
    for (const row of rows) {
      try {
        const { key, uploadUrl } = await api.post<{ key: string; uploadUrl: string }>(
          '/files/upload-url',
          {
            purpose: row.purpose,
            contentType: 'image/jpeg',
          },
        );
        const file = new File(row.uri);
        const result = await file.upload(uploadUrl, {
          httpMethod: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
        });
        if (result.status < 200 || result.status >= 300) {
          throw new Error(`Dépôt refusé (${result.status})`);
        }
        const { engine } = await getSync();
        await engine.enqueue({
          type: 'attachment.link',
          siteId: row.site_id,
          payload: { targetOpId: row.target_op_id, key },
        });
        await serialized(() =>
          db.runAsync(
            "UPDATE uploads SET status = 'sent', key = ?, last_error = NULL WHERE id = ?",
            key,
            row.id,
          ),
        );
        if (file.exists) file.delete();
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await serialized(() =>
          db.runAsync(
            'UPDATE uploads SET attempts = attempts + 1, last_error = ? WHERE id = ?',
            message,
            row.id,
          ),
        );
        // Stockage absent ou réseau coupé : inutile d'essayer les suivantes maintenant.
        break;
      }
    }
    if (sent > 0) void (await getSync()).engine.flush();
    return sent;
  })()
    .catch(() => 0)
    .finally(() => {
      running = null;
    });
  return running;
}

export async function pendingPhotos(): Promise<{ count: number; lastError: string | null }> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number; err: string | null }>(
    "SELECT COUNT(*) AS n, MAX(last_error) AS err FROM uploads WHERE status = 'pending'",
  );
  return { count: row?.n ?? 0, lastError: row?.err ?? null };
}

/** À la déconnexion : les photos locales partent avec la base (NFM7). */
export function wipePhotos(): void {
  const dir = new Directory(Paths.document, 'uploads');
  if (dir.exists) dir.delete();
}
