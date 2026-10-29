import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Pressable } from 'react-native';
import { useSession } from '../../lib/session';
import { ChambresScreen } from '../../screens/ChambresScreen';
import { getSync } from '../../sync/engine';
import { colors, touch } from '../../ui/theme';

/**
 * Le gardien n'a pas d'onglet « Plus » : son compte (synchronisation, déconnexion) est
 * dans un menu en haut du plan des chambres (spécification des écrans).
 */
export default function Chambres() {
  const { user, signOut } = useSession();
  const openMenu = () =>
    Alert.alert(user?.name ?? 'Mon compte', 'Gardien', [
      {
        text: 'Synchroniser maintenant',
        onPress: () => {
          if (user?.siteId) void getSync().then(({ engine }) => engine.syncNow(user.siteId!));
        },
      },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => void signOut() },
      { text: 'Fermer', style: 'cancel' },
    ]);
  return (
    <ChambresScreen
      headerAction={
        <Pressable
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel="Mon compte"
          style={{
            width: touch.min,
            height: touch.min,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="person-circle-outline" size={32} color={colors.brand} />
        </Pressable>
      }
    />
  );
}
