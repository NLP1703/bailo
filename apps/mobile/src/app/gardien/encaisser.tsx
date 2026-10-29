import { useLocalSearchParams } from 'expo-router';
import { EncaisserScreen } from '../../screens/EncaisserScreen';

export default function Encaisser() {
  const { unitId } = useLocalSearchParams<{ unitId?: string }>();
  return <EncaisserScreen unitId={unitId} />;
}
