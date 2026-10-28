import Constants from 'expo-constants';

/**
 * Adresse de l'API. Par défaut, le proxy same-origin du site Bailo (`/api/v1`).
 * En développement, `EXPO_PUBLIC_API_URL` permet de viser une API locale
 * (ex. http://192.168.1.10:3000/api/v1 depuis un téléphone sur le même Wi-Fi).
 */
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'https://bailo-web-production.up.railway.app/api/v1'
).replace(/\/+$/, '');

/** Version de l'application envoyée à chaque requête (NFM14). */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

/** Délai en arrière-plan avant de redemander le PIN ou la biométrie (RGM11). */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

/** Erreurs de PIN tolérées avant de revenir au mot de passe (décision D4). */
export const MAX_PIN_ATTEMPTS = 5;

/** Rafraîchissement des données en usage (RGM5). */
export const PULL_INTERVAL_MS = 15 * 60 * 1000;
