import * as Sentry from '@sentry/node';

/**
 * Monitoring des erreurs serveur (6.4). Inactif tant que `SENTRY_DSN` n'est pas
 * défini : `captureServerError` ne fait alors rien.
 *
 * Données personnelles (NF8) : aucune donnée de requête n'est envoyée (corps,
 * en-têtes, cookies, paramètres), seulement la pile d'erreur et des étiquettes
 * techniques (identifiant de requête, compte).
 */
let enabled = false;

export function initMonitoring(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || enabled) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.APP_VERSION,
    // Erreurs uniquement : pas de traçage de performance.
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // Les logs console peuvent contenir des noms ou numéros de locataires.
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
  });
  enabled = true;
}

export function isMonitoringEnabled(): boolean {
  return enabled;
}

/** Signale une erreur serveur avec des étiquettes techniques (no-op sans DSN). */
export function captureServerError(
  error: unknown,
  tags: Record<string, string | undefined> = {},
): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) {
      if (value) scope.setTag(key, value);
    }
    Sentry.captureException(error);
  });
}
