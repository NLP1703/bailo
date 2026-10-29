import { useLocalSearchParams } from 'expo-router';
import { PannesScreen } from '../screens/PannesScreen';

export default function Pannes() {
  const { unitId } = useLocalSearchParams<{ unitId?: string }>();
  return <PannesScreen standalone unitId={unitId} />;
}
