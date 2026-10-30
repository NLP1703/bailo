import { useLocalSearchParams } from 'expo-router';
import { NouvelleEntreeScreen } from '../screens/NouvelleEntreeScreen';

/** T6 — nouvelle entrée depuis une fiche chambre libre (gérant et propriétaire). */
export default function NouvelleEntreeDepuisFiche() {
  const { unitId } = useLocalSearchParams<{ unitId?: string }>();
  return <NouvelleEntreeScreen unitId={unitId} />;
}
