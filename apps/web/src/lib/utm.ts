/**
 * Capture des paramètres UTM à l'arrivée sur le site.
 *
 * À l'ouverture de n'importe quelle page avec `?utm_source=…`, on enregistre
 * le set complet dans `localStorage` (une seule entrée) et on nettoie l'URL
 * (replaceState) pour que le partage de lien ne garde pas les traceurs.
 *
 * Les valeurs sont ensuite consommables par n'importe quel code analytics
 * ajouté plus tard (dashboard interne, pixel, etc.) via `getUtm()`.
 * Aucune donnée tierce n'est envoyée — pas de cookie, pas de script externe.
 */

const KEY = 'bailo.utm';
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export type UtmSet = Partial<Record<(typeof PARAMS)[number], string>> & { capturedAt?: string };

/** Lit les UTM capturés précédemment. Jamais lève. */
export function getUtm(): UtmSet {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UtmSet) : {};
  } catch {
    return {};
  }
}

/** À appeler au boot : capture et nettoie l'URL si nécessaire. */
export function captureUtm(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const found: UtmSet = {};
    let hasAny = false;
    for (const p of PARAMS) {
      const v = url.searchParams.get(p);
      if (v) {
        found[p] = v;
        hasAny = true;
        url.searchParams.delete(p);
      }
    }
    if (!hasAny) return;
    found.capturedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(found));
    // Remplace l'URL sans traceurs — pas de rechargement, pas d'entrée dans l'historique.
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* URL ou localStorage indisponible : silencieux. */
  }
}
