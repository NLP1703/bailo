import { Redirect } from 'expo-router';
import { useSession } from '../lib/session';

/** Aiguillage vers l'étape de session en cours ou vers l'accueil du rôle. */
export default function Index() {
  const { status, user } = useSession();
  if (status === 'signedOut' || status === 'loading') return <Redirect href="/sign-in" />;
  if (status === 'choosePin') return <Redirect href="/choose-pin" />;
  if (status === 'locked') return <Redirect href="/unlock" />;
  if (user?.role === 'OWNER') return <Redirect href="/proprio/vue-ensemble" />;
  if (user?.role === 'MANAGER') return <Redirect href="/gerant/accueil" />;
  return <Redirect href="/gardien/chambres" />;
}
