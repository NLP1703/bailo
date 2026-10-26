// Client REST minimal (sécurité 1.2) :
//  - le jeton d'accès (15 min) vit uniquement en mémoire, jamais dans localStorage ;
//  - le refresh token est un cookie HttpOnly posé par l'API, illisible ici ;
//  - un 401 déclenche une seule rotation partagée, puis la requête est rejouée.
//
// En image Docker, l'API est relayée par nginx sur le même domaine (/api/v1) : le
// cookie de session est alors « first-party » et accepté par tous les navigateurs.
const API =
  import.meta.env.VITE_API_SAME_ORIGIN === 'true'
    ? '/api/v1'
    : (import.meta.env.VITE_API_URL ?? '/api/v1');

/** Indice non sensible : « une session a été ouverte sur cet appareil ». */
const SESSION_HINT_KEY = 'bailo.session';
/** Anciennes clés (jetons en clair) — lues une fois pour migrer, puis effacées. */
const LEGACY_ACCESS_KEY = 'at';
const LEGACY_REFRESH_KEY = 'rt';

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible (navigation privée) : la session reste en mémoire */
  }
}
function storageRemove(...keys: string[]): void {
  try {
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* idem */
  }
}

/** Mémorise le jeton d'accès reçu à la connexion / l'inscription. */
export function setAccessToken(token: string): void {
  accessToken = token;
  storageSet(SESSION_HINT_KEY, '1');
  storageRemove(LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY);
}

/** Oublie la session locale (le cookie, lui, est retiré par `/auth/logout`). */
export function clearSession(): void {
  accessToken = null;
  storageRemove(SESSION_HINT_KEY, LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY);
  // Les réponses GET mises en cache par le service worker appartiennent à
  // l'utilisateur déconnecté : on les purge (appareil partagé).
  if (typeof caches !== 'undefined') void caches.delete('api').catch(() => undefined);
}

/** Vrai si une session a pu être ouverte sur cet appareil (évite un refresh inutile au démarrage). */
export function mayHaveSession(): boolean {
  return Boolean(accessToken || storageGet(SESSION_HINT_KEY) || storageGet(LEGACY_REFRESH_KEY));
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** Vrai pour une erreur réseau (hors-ligne, DNS…) par opposition à une réponse HTTP. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * Renouvelle le jeton d'accès via le cookie HttpOnly. Les appels concurrents
 * partagent la même rotation (sinon le 2e refresh présenterait un jeton déjà révoqué).
 * Lève une erreur réseau si l'API est injoignable ; renvoie `false` si la session a expiré.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    // Migration : une session ouverte avant le passage aux cookies a son refresh
    // dans localStorage ; on le présente une dernière fois, l'API le convertit en cookie.
    const legacy = storageGet(LEGACY_REFRESH_KEY);
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(legacy ? { refreshToken: legacy } : {}),
      });
      storageRemove(LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY);
      if (!res.ok) {
        accessToken = null;
        storageRemove(SESSION_HINT_KEY);
        return false;
      }
      const data = (await res.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return true;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function isAuthRoute(url: string): boolean {
  return url.includes('/auth/');
}

/**
 * `fetch` authentifié vers une URL absolue de l'API (téléchargements de PDF/CSV…) :
 * ajoute le jeton d'accès et rejoue une fois après rotation sur 401.
 */
export async function authFetch(
  url: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(url, { ...init, headers, credentials: 'include' });
  if (res.status === 401 && retry && !isAuthRoute(url) && (await refreshSession())) {
    return authFetch(url, init, false);
  }
  return res;
}

async function raw(method: string, path: string, body?: unknown): Promise<Response> {
  return authFetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    let code: string | undefined;
    let details: unknown;
    let retryAfterSeconds: number | undefined;
    try {
      const data = (await res.json()) as {
        message?: string;
        code?: string;
        details?: unknown;
        retryAfterSeconds?: number;
      };
      if (data?.message) message = data.message;
      code = data?.code;
      details = data?.details;
      retryAfterSeconds = data?.retryAfterSeconds;
    } catch {
      /* body non-JSON — on garde le message par défaut */
    }
    throw new ApiError(res.status, message, code, details, retryAfterSeconds);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: async <T>(path: string): Promise<T> => parse<T>(await raw('GET', path)),
  post: async <T>(path: string, body?: unknown): Promise<T> =>
    parse<T>(await raw('POST', path, body)),
  patch: async <T>(path: string, body?: unknown): Promise<T> =>
    parse<T>(await raw('PATCH', path, body)),
  put: async <T>(path: string, body?: unknown): Promise<T> =>
    parse<T>(await raw('PUT', path, body)),
  del: async (path: string): Promise<void> => {
    const res = await raw('DELETE', path);
    if (!res.ok) await parse(res); // lève une ApiError avec le message serveur
  },
  /** DELETE dont on exploite la réponse JSON (ex. `{ mode: 'deleted' | 'archived' }`). */
  delete: async <T>(path: string): Promise<T> => parse<T>(await raw('DELETE', path)),
};

export { API };
