import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { FilePurpose, UploadUrlResult, DownloadUrlResult } from '@bailo/shared';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { requireContext } from '../../common/tenancy/request-context';
import { presignS3Url, type PresignConfig } from './sigv4';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

@Injectable()
export class StorageService {
  private readonly config: PresignConfig; // signature pour le navigateur
  private readonly internalConfig: PresignConfig; // joignable par le serveur (fetch direct)

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    const base = {
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    };
    this.config = { ...base, endpoint: env.S3_ENDPOINT };
    this.internalConfig = { ...base, endpoint: env.S3_INTERNAL_ENDPOINT || env.S3_ENDPOINT };
  }

  /**
   * Préfixe propre au compte : garantit le cloisonnement (NF7) — une clé lisible par un
   * compte commence toujours par `accounts/{accountId}/`.
   */
  private prefix(accountId: string): string {
    return `accounts/${accountId}/`;
  }

  /** URL signée de dépôt (PUT direct vers S3/MinIO) + clé à persister sur la ressource. */
  createUploadUrl(purpose: FilePurpose, contentType: string): UploadUrlResult {
    const { accountId } = requireContext();
    const ext = EXTENSION[contentType] ?? 'bin';
    const key = `${this.prefix(accountId)}${purpose}/${randomUUID()}.${ext}`;
    const expiresIn = this.env.FILE_SIGNED_URL_TTL_SECONDS;
    const uploadUrl = presignS3Url(this.config, { method: 'PUT', key, expiresIn });
    return { key, uploadUrl, expiresIn };
  }

  /** URL signée de lecture à durée limitée ; refuse une clé d'un autre compte (NF7). */
  createDownloadUrl(key: string): DownloadUrlResult {
    const { accountId } = requireContext();
    if (!key.startsWith(this.prefix(accountId))) {
      throw new ForbiddenException("Cette ressource n'appartient pas au compte");
    }
    const expiresIn = this.env.FILE_SIGNED_URL_TTL_SECONDS;
    const url = presignS3Url(this.config, { method: 'GET', key, expiresIn });
    return { url, expiresIn };
  }

  /**
   * Récupère un objet CÔTÉ SERVEUR et le renvoie en data-URL (pour inliner une image dans un
   * PDF rendu côté serveur, ex. le logo sur un reçu). Utilise l'endpoint interne. Renvoie
   * `undefined` en cas d'échec — le document reste rendu sans l'image.
   */
  async fetchAsDataUri(key: string): Promise<string | undefined> {
    try {
      const url = presignS3Url(this.internalConfig, { method: 'GET', key, expiresIn: 60 });
      const res = await fetch(url);
      if (!res.ok) return undefined;
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
      const buffer = Buffer.from(await res.arrayBuffer());
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch {
      return undefined;
    }
  }
}
