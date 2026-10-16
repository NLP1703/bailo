import type { FilePurpose, UploadUrlResult, DownloadUrlResult } from '@bailo/shared';
import { api } from './api';

/**
 * Dépose un fichier sur le stockage objet via une URL signée (NF8) et renvoie la clé
 * objet à persister sur la ressource. Nécessite le réseau (les preuves saisies hors-ligne
 * sont simplement omises : le paiement, lui, est mis en file et synchronisé plus tard).
 */
export async function uploadFile(file: File, purpose: FilePurpose): Promise<string> {
  const { key, uploadUrl } = await api.post<UploadUrlResult>('/files/upload-url', {
    purpose,
    contentType: file.type,
  });
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error(`Échec du dépôt (${res.status})`);
  return key;
}

/** URL de lecture signée à durée limitée pour afficher/télécharger un fichier. */
export async function signedUrl(key: string): Promise<string> {
  const { url } = await api.post<DownloadUrlResult>('/files/download-url', { key });
  return url;
}
