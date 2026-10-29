import { API_URL, APP_VERSION } from './config';
import { deleteSecret, getSecret, setSecret } from './secure';

/** Erreur renvoyée par l'API (corps `{ code, message }` côté Bailo). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

interface AuthSession {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

/** Jeton d'accès : en mémoire seulement, jamais écrit sur le disque. */
let accessToken: string | null = null;
let deviceKey: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

/** Identifiant de ce téléphone, joint à chaque requête (contrôle des appareils déconnectés). */
export function setDeviceKey(id: string | null): void {
  deviceKey = id;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Appelé quand le serveur refuse définitivement la session (appareil déconnecté, compte désactivé). */
export function onExpired(handler: () => void): void {
  onSessionExpired = handler;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Bailo-Client': 'native',
    'X-Bailo-App-Version': APP_VERSION,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(deviceKey ? { 'X-Bailo-Device': deviceKey } : {}),
    ...extra,
  };
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as
    (T & { code?: string; message?: string | string[]; details?: unknown }) | null;
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(res.status, message ?? `Erreur ${res.status}`, body?.code, body?.details);
  }
  return body as T;
}

/** Ouvre une session à partir de la réponse de connexion : garde le refresh token dans le trousseau. */
export async function storeSession(session: AuthSession): Promise<void> {
  accessToken = session.accessToken;
  if (session.refreshToken) await setSecret('refreshToken', session.refreshToken);
}

/** Renouvelle le jeton d'accès avec le refresh token (rotation côté serveur). Un seul appel à la fois. */
export function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = await getSecret('refreshToken');
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: headers({ Authorization: '' }),
        body: JSON.stringify({ refreshToken }),
      });
      if (res.status === 401 || res.status === 403) {
        await deleteSecret('refreshToken');
        accessToken = null;
        onSessionExpired?.();
        return false;
      }
      await storeSession(await parse<AuthSession>(res));
      return true;
    } catch {
      return false; // hors-ligne : la session locale reste utilisable
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Requête authentifiée ; renouvelle le jeton une fois en cas de 401. */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  return parse<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Connexion par téléphone ou e-mail + mot de passe. */
export async function login(identifier: string, password: string): Promise<void> {
  const id = identifier.trim();
  const credentials = id.includes('@')
    ? { email: id, password }
    : { phone: id.replace(/[\s.-]/g, ''), password };
  accessToken = null;
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(credentials),
  });
  await storeSession(await parse<AuthSession>(res));
}

export async function logoutRemote(): Promise<void> {
  const refreshToken = await getSecret('refreshToken');
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
  } catch {
    /* hors-ligne : la session locale est effacée quand même */
  }
  accessToken = null;
}
