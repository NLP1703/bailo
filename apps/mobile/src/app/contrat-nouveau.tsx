import { useLocalSearchParams } from 'expo-router';
import { ContratNouveauScreen } from '../screens/ContratNouveauScreen';

/** Création d'un contrat (brouillon) à partir d'une occupation, depuis la fiche locataire. */
export default function ContratNouveau() {
  const { occupancyId } = useLocalSearchParams<{ occupancyId: string }>();
  return <ContratNouveauScreen occupancyId={occupancyId} />;
}
