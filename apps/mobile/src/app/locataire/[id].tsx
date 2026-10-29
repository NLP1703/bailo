import { useLocalSearchParams } from 'expo-router';
import { LocataireScreen } from '../../screens/LocataireScreen';

export default function Locataire() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LocataireScreen tenantId={id} />;
}
