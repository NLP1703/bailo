import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthTokens, MeView } from '@citegest/shared';
import { api, clearTokens, hasSession, setTokens } from './api';

interface AuthContextValue {
  user: MeView | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSession()) {
      setLoading(false);
      return;
    }
    api
      .get<MeView>('/me')
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  const login = async (phone: string, password: string): Promise<void> => {
    const tokens = await api.post<AuthTokens>('/auth/login', { phone, password });
    setTokens(tokens.accessToken, tokens.refreshToken);
    setUser(await api.get<MeView>('/me'));
  };

  const logout = async (): Promise<void> => {
    const rt = localStorage.getItem('rt');
    try {
      if (rt) await api.post('/auth/logout', { refreshToken: rt });
    } finally {
      clearTokens();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors AuthProvider');
  return ctx;
}
