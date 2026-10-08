import { z } from 'zod';

/**
 * Usages de fichier autorisés (NF8). Chaque usage détermine le préfixe de la clé objet
 * et le contrôle de rôle côté serveur. Les locataires/parents n'ayant aucun accès,
 * tous ces fichiers sont déposés par l'équipe du bailleur.
 */
export const FILE_PURPOSES = [
  'tenant-photo', // F3.1 — photo du locataire
  'tenant-id', // F3.1 — pièce d'identité (chiffrée, jamais publique)
  'payment-proof', // F6.2 — preuve (capture MoMo, photo)
  'expense-attachment', // F8.1 — pièce jointe d'une dépense
  'unit-photo', // F2.4 — photos d'une chambre
  'account-logo', // F1.5 — logo affiché sur les reçus
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/** Types MIME acceptés pour un dépôt (images + PDF pour les preuves/pièces). */
export const UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

export const uploadUrlDto = z.object({
  purpose: z.enum(FILE_PURPOSES),
  contentType: z.enum(UPLOAD_CONTENT_TYPES),
});
export type UploadUrlDto = z.infer<typeof uploadUrlDto>;

export interface UploadUrlResult {
  /** Clé objet à stocker dans la ressource (ex. tenant.photoKey). */
  key: string;
  /** URL signée pour le PUT direct vers le stockage S3/MinIO. */
  uploadUrl: string;
  /** Durée de validité de l'URL, en secondes. */
  expiresIn: number;
}

export const downloadUrlDto = z.object({
  key: z.string().min(1).max(512),
});
export type DownloadUrlDto = z.infer<typeof downloadUrlDto>;

export interface DownloadUrlResult {
  url: string;
  expiresIn: number;
}
