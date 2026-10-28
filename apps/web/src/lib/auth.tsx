import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthSession, LoginDto, MeView, SignupDto } from '@bailo/shared';
import {
  api,
  clearSession,
  isNetworkError,
  mayHaveSession,
  refreshSession,
  setAccessToken,
} from './api';
import { setMonitoringUser } from './monitoring';

interface AuthContextValue {
  user: MeView | null;
  loading: boolean;
  login: (credentials: LoginDto) => Promise<void>;
  signup: (dto: SignupDto) => Promise<void>;
  /** Accepte une invitation reçue par e-mail et ouvre la session du nouveau membre. */
  acceptInvitation: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Recharge /me (offre, lecture seule…) sans recharger la page. */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Profil mis en cache pour l'ouverture hors-ligne de la PWA (NF3). Il ne contient
 * aucun secret : sans réseau, aucun appel API n'aboutit de toute façon, et les
 * paiements saisis partent dans la file d'attente jusqu'au retour du réseau.
 */
const CACHED_ME_KEY = 'bailo.me';

function readCachedMe(): MeView | null {
  try {
    const raw = localStorage.getItem(CACHED_ME_KEY);
    return raw ? (JSON.parse(raw) as MeView) : null;
  } catch {
    return null;
  }
}
function writeCachedMe(me: MeView | null): void {
  try {
    if (me) localStorage.setItem(CACHED_ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(CACHED_ME_KEY);
  } catch {
    /* stockage indisponible : pas de mode hors-ligne au démarrage */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<MeView | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = (me: MeView | null): void => {
    setUserState(me);
    writeCachedMe(me);
    setMonitoringUser(me);
  };

  useEffect(() => {
    // Le jeton d'accès n'est pas persisté : au démarrage, on le régénère à partir
    // du cookie HttpOnly. Un visiteur jamais connecté ne déclenche aucun appel.
    if (!mayHaveSession()) {
      writeCachedMe(null);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        if (await refreshSession()) {
          setUser(await api.get<MeView>('/me'));
        } else {
          clearSession();
          setUser(null);
        }
      } catch (error) {
        if (isNetworkError(error)) {
          // Hors-ligne : on rouvre l'app avec le dernier profil connu.
          setUserState(readCachedMe());
        } else {
          clearSession();
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openSession = async (session: AuthSession): Promise<void> => {
    setAccessToken(session.accessToken);
    setUser(await api.get<MeView>('/me'));
  };

  const login = async (credentials: LoginDto): Promise<void> => {
    await openSession(await api.post<AuthSession>('/auth/login', credentials));
  };

  // Inscription d'un bailleur : création directe du compte + propriétaire,
  // qui ouvre immédiatement la session (sans code de vérification).
  const signup = async (dto: SignupDto): Promise<void> => {
    await openSession(await api.post<AuthSession>('/auth/signup', dto));
  };

  const acceptInvitation = async (token: string, password: string): Promise<void> => {
    await openSession(
      await api.post<AuthSession>(`/auth/invitations/${encodeURIComponent(token)}/accept`, { password }),
    );
  };

  const logout = async (): Promise<void> => {
    try {
      // Le cookie HttpOnly accompagne la requête : l'API révoque le refresh et l'efface.
      await api.post('/auth/logout', {});
    } catch {
      /* hors-ligne : la session locale est oubliée quand même */
    } finally {
      clearSession();
      setUser(null);
    }
  };

  const refreshMe = async (): Promise<void> => {
    setUser(await api.get<MeView>('/me'));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, acceptInvitation, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors AuthProvider');
  return ctx;
}
