import { useLocalSearchParams } from 'expo-router';
import { ChambresScreen } from '../../screens/ChambresScreen';

export default function Chambres() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  return <ChambresScreen initialStatus={status} />;
}
