import { View } from 'react-native';
import { useSession } from '../../lib/session';
import { Placeholder, PrimaryButton } from '../../ui/components';

/** Le gardien n'a pas d'onglet « Plus » : sa déconnexion est ici en attendant le menu de compte (LM3). */
export default function Chambres() {
  const { signOut } = useSession();
  return (
    <Placeholder
      title="Chambres"
      lot="LM3"
      footer={
        <View style={{ marginTop: 8 }}>
          <PrimaryButton label="Se déconnecter" tone="outline" onPress={() => void signOut()} />
        </View>
      }
    >
      Plan des chambres en grille colorée et fiches, consultables hors-ligne (maquettes T3 et T4).
    </Placeholder>
  );
}
