import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserRole } from '@citegest/shared';

/** Contexte propagé sur toute la durée d'une requête (via AsyncLocalStorage). */
export interface RequestContext {
  userId: string;
  accountId: string;
  role: UserRole;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Contexte courant, ou undefined pour les routes publiques (auth, vérif. reçu). */
export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Contexte courant, ou lève si absent (route protégée mal configurée). */
export function requireContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      'Contexte de requête absent : accès à des données scoping-compte hors requête authentifiée.',
    );
  }
  return ctx;
}
