/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** "true" : appeler l'API en relatif (/api/v1), relayée par nginx sur le même domaine. */
  readonly VITE_API_SAME_ORIGIN?: string;
  readonly VITE_PUBLIC_RECEIPT_BASE: string;
  /** DSN Sentry du front ; absent = monitoring désactivé (SDK non chargé). */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_APP_VERSION?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
