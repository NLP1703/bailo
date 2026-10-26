// Monitoring des erreurs front (6.4). Sentry n'est chargé que si `VITE_SENTRY_DSN`
// est défini au build : sans DSN, aucun octet du SDK n'est téléchargé (import
// dynamique → chunk séparé), ce qui préserve le budget de chargement en 3G (NF2).

type SentryModule = typeof import('@sentry/react');

let sentry: SentryModule | null = null;
/** Erreurs survenues avant la fin du chargement du SDK, envoyées dès qu'il est prêt. */
const pending: { error: unknown; context?: Record<string, unknown> }[] = [];

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  void import('@sentry/react')
    .then((mod) => {
      mod.init({
        dsn,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
        release: import.meta.env.VITE_APP_VERSION,
        // Pas de traçage de performance ni de replay : uniquement les erreurs.
        tracesSampleRate: 0,
        // Données personnelles des locataires : rien d'autre que la pile d'erreur ne part.
        // (Par défaut le SDK collecte cookies, en-têtes, paramètres d'URL et corps.)
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
        // Les fils d'Ariane « console » peuvent contenir des noms ou téléphones.
        beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
      });
      sentry = mod;
      for (const item of pending.splice(0)) {
        mod.captureException(item.error, item.context ? { extra: item.context } : undefined);
      }
    })
    .catch(() => {
      /* hors-ligne au démarrage : le monitoring reste inactif pour cette session */
    });
}

/** Signale une erreur (no-op sans DSN). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  if (sentry) {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } else if (pending.length < 20) {
    pending.push({ error, context });
  }
}

/** Associe les erreurs à l'utilisateur connecté (identifiants techniques uniquement). */
export function setMonitoringUser(
  user: { id: string; role: string; accountId: string } | null,
): void {
  if (!sentry) return;
  sentry.setUser(user ? { id: user.id } : null);
  sentry.setTag('role', user?.role ?? 'anonymous');
  sentry.setTag('account', user?.accountId ?? 'none');
}
