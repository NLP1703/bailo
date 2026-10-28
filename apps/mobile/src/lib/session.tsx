import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { deleteDatabase } from '../db/database';
import { getSync, resetSync } from '../sync/engine';
import { api, login, logoutRemote, onExpired, refreshSession } from './api';
import { LOCK_AFTER_MS } from './config';
import { checkPin, clearPin, hasPin, setPin, unlockWithBiometrics } from './pin';
import { getSecret, setSecret, wipeSession } from './secure';

export type Role = 'OWNER' | 'MANAGER' | 'CARETAKER';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  accountName: string;
  siteIds: string[];
  readOnly: boolean;
  /** Site affiché par défaut (MG1.4). */
  siteId: string | null;
}

export type SessionStatus = 'loading' | 'signedOut' | 'choosePin' | 'locked' | 'ready';

interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  /** Message à afficher sur l'écran de connexion (session expirée, trop d'erreurs de PIN). */
  notice: string | null;
  signIn(identifier: string, password: string): Promise<void>;
  choosePin(pin: string): Promise<void>;
  unlock(pin: string): Promise<{ ok: boolean; remaining: number }>;
  unlockBiometric(): Promise<boolean>;
  signOut(notice?: string): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

async function fetchUser(): Promise<SessionUser> {
  const me = await api.get<Omit<SessionUser, 'siteId'>>('/me');
  let siteId = me.siteIds[0] ?? null;
  if (!siteId) {
    // Le propriétaire voit tous les sites : on prend le premier de la liste.
    const sites = await api.get<Array<{ id: string }>>('/sites').catch(() => []);
    siteId = sites[0]?.id ?? null;
  }
  return {
    id: me.id,
    name: me.name,
    role: me.role,
    accountName: me.accountName,
    siteIds: me.siteIds,
    readOnly: me.readOnly,
    siteId,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const backgroundSince = useRef<number | null>(null);

  const signOut = useCallback(async (message?: string) => {
    // Les opérations en attente partent d'abord si le réseau le permet (RGM12).
    try {
      const { engine } = await getSync();
      await engine.flush();
    } catch {
      /* hors-ligne ou base absente */
    }
    await logoutRemote();
    await resetSync();
    await deleteDatabase();
    await clearPin();
    await wipeSession();
    setUser(null);
    setNotice(message ?? null);
    setStatus('signedOut');
  }, []);

  // Démarrage : session locale présente → verrouillée, sinon écran de connexion.
  useEffect(() => {
    void (async () => {
      const [token, cached] = await Promise.all([getSecret('refreshToken'), getSecret('user')]);
      if (!token || !cached) return setStatus('signedOut');
      setUser(JSON.parse(cached) as SessionUser);
      setStatus((await hasPin()) ? 'locked' : 'choosePin');
    })();
  }, []);

  // Session refusée par le serveur (appareil déconnecté à distance, compte désactivé).
  useEffect(() => {
    onExpired(() => void signOut('Votre session a pris fin. Reconnectez-vous.'));
  }, [signOut]);

  // Verrouillage après 5 minutes en arrière-plan (RGM11).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundSince.current = Date.now();
      if (state === 'active' && backgroundSince.current !== null) {
        const away = Date.now() - backgroundSince.current;
        backgroundSince.current = null;
        setStatus((s) => (s === 'ready' && away >= LOCK_AFTER_MS ? 'locked' : s));
      }
    });
    return () => sub.remove();
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    await login(identifier, password);
    const me = await fetchUser();
    await setSecret('user', JSON.stringify(me));
    setUser(me);
    setNotice(null);
    setStatus('choosePin');
  }, []);

  const choosePin = useCallback(async (pin: string) => {
    await setPin(pin);
    setStatus('ready');
  }, []);

  const afterUnlock = useCallback(() => {
    setStatus('ready');
    // En ligne : nouveau jeton d'accès et profil à jour ; hors-ligne : on continue.
    void refreshSession().then(async (ok) => {
      if (!ok) return;
      const me = await fetchUser().catch(() => null);
      if (me) {
        await setSecret('user', JSON.stringify(me));
        setUser(me);
      }
    });
  }, []);

  const unlock = useCallback(
    async (pin: string) => {
      const result = await checkPin(pin);
      if (result.ok) {
        afterUnlock();
        return { ok: true, remaining: 0 };
      }
      if (result.remaining === 0) {
        await signOut('Trop d’erreurs de code : reconnectez-vous avec votre mot de passe.');
      }
      return { ok: false, remaining: result.remaining };
    },
    [afterUnlock, signOut],
  );

  const unlockBiometric = useCallback(async () => {
    const ok = await unlockWithBiometrics();
    if (ok) afterUnlock();
    return ok;
  }, [afterUnlock]);

  const value = useMemo<SessionValue>(
    () => ({ status, user, notice, signIn, choosePin, unlock, unlockBiometric, signOut }),
    [status, user, notice, signIn, choosePin, unlock, unlockBiometric, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession doit être utilisé sous <SessionProvider>');
  return value;
}
