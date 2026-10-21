import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * État du stockage objet (branché ou non sur ce déploiement). Partagé entre
 * tous les champs d'upload : chargé une seule fois, mis en cache en mémoire
 * (pas de persistance : la décision peut changer après un redéploiement).
 */
let cached: { enabled: boolean } | null = null;
let pending: Promise<{ enabled: boolean }> | null = null;

async function fetchStatus(): Promise<{ enabled: boolean }> {
  if (cached) return cached;
  pending ??= api
    .get<{ enabled: boolean }>('/files/status')
    .then((r) => {
      cached = r;
      return r;
    })
    .catch(() => {
      // Erreur réseau : on suppose activé pour ne pas bloquer l'UI, le PUT
      // remontera une erreur plus précise si besoin.
      cached = { enabled: true };
      return cached;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Hook : expose `enabled` (undefined pendant le chargement). */
export function useStorageStatus(): { enabled: boolean | undefined } {
  const [enabled, setEnabled] = useState<boolean | undefined>(cached?.enabled);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetchStatus().then((r) => {
      if (alive) setEnabled(r.enabled);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { enabled };
}
