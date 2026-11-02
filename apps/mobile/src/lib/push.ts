import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Jeton push Expo de cet appareil, ou `null` si la permission est refusée, le service
 * indisponible, ou le module natif absent (build sans notifications). Best-effort : ne
 * lève jamais — le push est un confort, il ne doit pas gêner l'usage hors-ligne (NFM5).
 */
export async function getPushToken(): Promise<string | null> {
  try {
    const current = await Notifications.getPermissionsAsync();
    const granted =
      current.granted ||
      (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Bailo',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data;
  } catch {
    return null;
  }
}
