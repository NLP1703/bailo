import { useLocalSearchParams } from 'expo-router';
import { FicheChambreScreen } from '../../screens/FicheChambreScreen';

export default function FicheChambre() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FicheChambreScreen unitId={id} />;
}
