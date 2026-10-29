import { useLocalSearchParams } from 'expo-router';
import { EncaisserScreen } from '../screens/EncaisserScreen';

/** Encaisser depuis une fiche chambre (tous rôles, y compris le propriétaire). */
export default function EncaisserDepuisFiche() {
  const { unitId } = useLocalSearchParams<{ unitId?: string }>();
  return <EncaisserScreen unitId={unitId} standalone />;
}
