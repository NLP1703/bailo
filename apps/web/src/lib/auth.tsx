import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthTokens, LoginDto, MeView, SignupDto } from '@bailo/shared';
import { api, clearTokens, hasSession, setTokens } from './api';

interface AuthContextValue {
  user: MeView | null;
  loading: boolean;
  login: (credentials: LoginDto) => Promise<void>;
  signup: (dto: SignupDto) => Promise<void>;
  logout: () => Promise<void>;
  /** Recharge /me (offre, lecture seule…) sans recharger la page. */
  refreshMe: () => Promise<void>;
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

  const login = async (credentials: LoginDto): Promise<void> => {
    const tokens = await api.post<AuthTokens>('/auth/login', credentials);
    setTokens(tokens.accessToken, tokens.refreshToken);
    setUser(await api.get<MeView>('/me'));
  };

  // Inscription d'un bailleur : création directe du compte + propriétaire,
  // qui ouvre immédiatement la session (sans code de vérification).
  const signup = async (dto: SignupDto): Promise<void> => {
    const tokens = await api.post<AuthTokens>('/auth/signup', dto);
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

  const refreshMe = async (): Promise<void> => {
    setUser(await api.get<MeView>('/me'));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors AuthProvider');
  return ctx;
}
