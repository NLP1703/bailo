import { z } from 'zod';

/**
 * Booléen d'environnement robuste. `z.coerce.boolean()` est piégeux : `Boolean('false')`
 * vaut `true` (toute chaîne non vide). On interprète donc explicitement les valeurs usuelles.
 */
const boolEnv = (def: boolean) =>
  z
    .preprocess((v) => {
      if (typeof v !== 'string') return v;
      const s = v.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(s)) return true;
      if (['0', 'false', 'no', 'off', ''].includes(s)) return false;
      return v; // valeur inattendue : laissée à la validation (échec explicite)
    }, z.boolean())
    .default(def);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TZ: z.string().default('Africa/Douala'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Jobs planifiés (BullMQ). Désactivés par défaut (dev/test) ; activés en prod.
  ENABLE_JOBS: boolEnv(false),
  JOBS_CRON: z.string().default('0 2 * * *'), // 02:00 Africa/Douala (maintenance NF10)

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_REFRESH_TTL: z.string().default('30d'),
  OTP_TTL_SECONDS: z.coerce.number().int().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().default(5),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().default(5),

  SMS_PROVIDER: z.string().default('console'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'), // endpoint de SIGNATURE (navigateur)
  S3_INTERNAL_ENDPOINT: z.string().optional(), // endpoint joignable PAR LE SERVEUR (logo sur PDF)
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('citegest'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_FORCE_PATH_STYLE: boolEnv(true),
  FILE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().default(300),

  // Base publique des liens de vérification de reçu (QR code) — F6.4.
  PUBLIC_RECEIPT_BASE: z.string().default('http://localhost:5173/r'),
  PDF_ENGINE: z.string().default('puppeteer'),
});

export type AppEnv = z.infer<typeof envSchema>;

export const APP_ENV = Symbol('APP_ENV');

let cached: AppEnv | null = null;

export function loadEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration d'environnement invalide :\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
