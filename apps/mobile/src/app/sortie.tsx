import { useLocalSearchParams } from 'expo-router';
import { SortieScreen } from '../screens/SortieScreen';

/** Sortie du locataire (préavis + clôture) depuis la fiche locataire. */
export default function SortieDepuisFiche() {
  const { occupancyId } = useLocalSearchParams<{ occupancyId: string }>();
  return <SortieScreen occupancyId={occupancyId} />;
}
