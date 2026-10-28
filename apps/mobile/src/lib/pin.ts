import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { MAX_PIN_ATTEMPTS } from './config';
import { deleteSecret, getSecret, setSecret } from './secure';

/**
 * PIN à 4 chiffres lié à CE téléphone (décision D4). Seule son empreinte salée est gardée,
 * dans le trousseau du système ; 5 erreurs renvoient au mot de passe.
 */
export const PIN_LENGTH = 4;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function digest(salt: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function hasPin(): Promise<boolean> {
  return (await getSecret('pinHash')) !== null;
}

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`Le code doit compter ${PIN_LENGTH} chiffres`);
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  await setSecret('pinSalt', salt);
  await setSecret('pinHash', await digest(salt, pin));
  await setSecret('pinAttempts', '0');
}

export type PinCheck = { ok: true } | { ok: false; remaining: number };

/** Vérifie le PIN ; au-delà de 5 erreurs, `remaining` vaut 0 et la session doit être effacée. */
export async function checkPin(pin: string): Promise<PinCheck> {
  const [salt, hash, attempts] = await Promise.all([
    getSecret('pinSalt'),
    getSecret('pinHash'),
    getSecret('pinAttempts'),
  ]);
  if (!salt || !hash) return { ok: false, remaining: 0 };
  if ((await digest(salt, pin)) === hash) {
    await setSecret('pinAttempts', '0');
    return { ok: true };
  }
  const failed = Number(attempts ?? '0') + 1;
  await setSecret('pinAttempts', String(failed));
  return { ok: false, remaining: Math.max(0, MAX_PIN_ATTEMPTS - failed) };
}

export async function clearPin(): Promise<void> {
  await Promise.all([
    deleteSecret('pinHash'),
    deleteSecret('pinSalt'),
    deleteSecret('pinAttempts'),
  ]);
}

/** La biométrie est proposée seulement si le téléphone en a une, configurée (MX5). */
export async function biometricAvailable(): Promise<boolean> {
  return (
    (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
  );
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Déverrouiller Bailo',
    cancelLabel: 'Utiliser le code',
    disableDeviceFallback: true,
  });
  return result.success;
}
