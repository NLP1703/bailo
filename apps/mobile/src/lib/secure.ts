import * as SecureStore from 'expo-secure-store';

/**
 * Secrets gardés dans le trousseau du système (Keystore Android, Keychain iOS — NFM7) :
 * jamais dans la base locale ni dans les journaux.
 */
const KEYS = {
  refreshToken: 'bailo.refreshToken',
  deviceId: 'bailo.deviceId',
  dbKey: 'bailo.dbKey',
  pinHash: 'bailo.pinHash',
  pinSalt: 'bailo.pinSalt',
  pinAttempts: 'bailo.pinAttempts',
  user: 'bailo.user',
} as const;

export type SecureKey = keyof typeof KEYS;

export function getSecret(key: SecureKey): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS[key]);
}

export function setSecret(key: SecureKey, value: string): Promise<void> {
  return SecureStore.setItemAsync(KEYS[key], value);
}

export function deleteSecret(key: SecureKey): Promise<void> {
  return SecureStore.deleteItemAsync(KEYS[key]);
}

/** Efface tout ce qui lie ce téléphone au compte (déconnexion, RGM12). L'identifiant d'appareil est gardé. */
export async function wipeSession(): Promise<void> {
  await Promise.all(
    (['refreshToken', 'dbKey', 'pinHash', 'pinSalt', 'pinAttempts', 'user'] as const).map(
      deleteSecret,
    ),
  );
}
