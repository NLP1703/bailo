import { useLocalSearchParams } from 'expo-router';
import { SiteDetailScreen } from '../../screens/SiteDetailScreen';

/** LM5 — réglages d'un site (coordonnées, relances, pénalités, blocs). */
export default function SiteDetail() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return <SiteDetailScreen id={id} siteName={name} />;
}
