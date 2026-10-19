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

/**
 * Secrets JWT : min 8 car en dev ; mais en production on exige au moins 32 caractères
 * et on rejette les placeholders ("change-me", "dev-...", "secret", etc.) qui traînent
 * souvent par erreur. Généré via `openssl rand -base64 48`.
 */
const WEAK_SECRET_PATTERNS = [
  /change[-_]?me/i,
  /^dev[-_]/i,
  /^test[-_]/i,
  /secret/i,
  /^placeholder/i,
  /^12345/,
  /password/i,
];

const jwtSecret = (field: string) =>
  z
    .string()
    .min(8, `${field} doit faire au moins 8 caractères`)
    .superRefine((val, ctx) => {
      if (process.env.NODE_ENV === 'production') {
        if (val.length < 32) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field} doit faire au moins 32 caractères en production (générer via "openssl rand -base64 48")`,
          });
        }
        if (WEAK_SECRET_PATTERNS.some((p) => p.test(val))) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field} ressemble à un placeholder — rejeté en production`,
          });
        }
      }
    });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().default(3000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    TZ: z.string().default('Africa/Douala'),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().default('redis://localhost:6379'),

    // Jobs planifiés (BullMQ). Désactivés par défaut (dev/test) ; activés en prod.
    ENABLE_JOBS: boolEnv(false),
    JOBS_CRON: z.string().default('0 2 * * *'), // 02:00 Africa/Douala (maintenance NF10)

    JWT_ACCESS_SECRET: jwtSecret('JWT_ACCESS_SECRET'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_SECRET: jwtSecret('JWT_REFRESH_SECRET'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    OTP_TTL_SECONDS: z.coerce.number().int().default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().default(5),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().default(5),

    SMS_PROVIDER: z.string().default('console'),

    S3_ENDPOINT: z.string().default('http://localhost:9000'), // endpoint de SIGNATURE (navigateur)
    S3_INTERNAL_ENDPOINT: z.string().optional(), // endpoint joignable PAR LE SERVEUR (logo sur PDF)
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('bailo'),
    S3_ACCESS_KEY: z.string().default('minioadmin'),
    S3_SECRET_KEY: z.string().default('minioadmin'),
    S3_FORCE_PATH_STYLE: boolEnv(true),
    FILE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().default(300),

    // Base publique des liens de vérification de reçu (QR code) — F6.4.
    PUBLIC_RECEIPT_BASE: z.string().default('http://localhost:5173/r'),
    // URL publique de l'API — utilisée par les callbacks webhooks (MoMo/OM).
    PUBLIC_API_URL: z.string().default('http://localhost:3000'),
    PDF_ENGINE: z.string().default('puppeteer'),

    // Cookies & auth-browser — passage des tokens de localStorage à des cookies HttpOnly (sécurité 1.2).
    COOKIE_SECRET: z.string().optional(), // signature des cookies (optionnel en dev)
    COOKIE_SECURE: boolEnv(false), // true en prod (HTTPS obligatoire)
    COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  })
  .superRefine((env, ctx) => {
    // En production : refuse les identifiants S3 par défaut (minioadmin) + exige HTTPS pour CORS.
    if (env.NODE_ENV === 'production') {
      if (env.S3_ACCESS_KEY === 'minioadmin' || env.S3_SECRET_KEY === 'minioadmin') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_ACCESS_KEY'],
          message:
            'Identifiants MinIO par défaut (minioadmin) interdits en production — générer des clés fortes',
        });
      }
      if (!env.CORS_ORIGIN.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGIN'],
          message: 'CORS_ORIGIN doit utiliser HTTPS en production',
        });
      }
    }
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

/** Utilitaire test : vide le cache (après avoir muté process.env dans un test). */
export function resetEnvCache(): void {
  cached = null;
}
