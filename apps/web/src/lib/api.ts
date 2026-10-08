// Client REST minimal : jeton d'accès + rotation automatique du refresh (NF6).
const API = import.meta.env.VITE_API_URL ?? '/api/v1';

let accessToken: string | null = localStorage.getItem('at');
let refreshToken: string | null = localStorage.getItem('rt');

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('at', access);
  localStorage.setItem('rt', refresh);
}
export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('at');
  localStorage.removeItem('rt');
}
export function hasSession(): boolean {
  return Boolean(accessToken);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function refresh(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

async function raw(method: string, path: string, body?: unknown, retry = true): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry && (await refresh())) {
    return raw(method, path, body, false);
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
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
};

export { API };
