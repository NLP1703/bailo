import { useLocalSearchParams } from 'expo-router';
import { ContratDetailScreen } from '../../screens/ContratDetailScreen';

/** LM5 — fiche d'un contrat (envoi pour signature, signature OTP, résiliation). */
export default function ContratDetail() {
  const { id, tenant } = useLocalSearchParams<{ id: string; tenant?: string }>();
  return <ContratDetailScreen id={id} tenantName={tenant} />;
}
