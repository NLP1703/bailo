import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../lib/session';
import { SiteDataProvider } from '../data/useSiteData';
import { SyncProvider } from '../sync/useSync';
import { colors } from '../ui/theme';

/**
 * Racine : chaque groupe d'écrans n'est accessible que dans le bon état de session
 * (connexion, choix du PIN, déverrouillage) et avec le bon rôle. Un lien profond vers un
 * écran protégé ramène à l'étape manquante.
 */
function RootNavigator() {
  const { status, user } = useSession();
  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.ground,
        }}
      >
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  const ready = status === 'ready';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'choosePin'}>
        <Stack.Screen name="choose-pin" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'locked'}>
        <Stack.Screen name="unlock" />
      </Stack.Protected>
      <Stack.Protected guard={ready && user?.role === 'CARETAKER'}>
        <Stack.Screen name="gardien" />
      </Stack.Protected>
      <Stack.Protected guard={ready && user?.role === 'MANAGER'}>
        <Stack.Screen name="gerant" />
      </Stack.Protected>
      <Stack.Protected guard={ready && user?.role === 'OWNER'}>
        <Stack.Screen name="proprio" />
      </Stack.Protected>
      {/* Écrans communs aux rôles, ouverts par-dessus les onglets. */}
      <Stack.Protected guard={ready}>
        <Stack.Screen name="chambre/[id]" />
        <Stack.Screen name="encaisser" />
      </Stack.Protected>
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <SyncProvider>
          <SiteDataProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </SiteDataProvider>
        </SyncProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
