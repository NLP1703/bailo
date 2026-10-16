/**
 * Codes d'erreur machine partagés entre API et front — l'UI décide du message
 * final (traduit via i18next). Chaque code vit avec son message FR par défaut
 * pour journalisation serveur.
 *
 * Format d'erreur HTTP renvoyé par l'API :
 *   { "code": "LOGIN_RATE_LIMITED", "message": "...", "details"?: unknown }
 */
export const ERROR_CODES = {
  // Auth
  AUTH_INVALID_CREDENTIALS: 'Identifiant ou mot de passe incorrect',
  AUTH_OTP_INVALID: 'Code de vérification invalide ou expiré',
  AUTH_PHONE_ALREADY_USED: 'Ce numéro est déjà associé à un compte',
  AUTH_EMAIL_ALREADY_USED: 'Cette adresse email est déjà utilisée',
  AUTH_SESSION_EXPIRED: 'Session expirée, veuillez vous reconnecter',
  LOGIN_RATE_LIMITED: 'Trop de tentatives, réessayez plus tard',

  // Billing / quotas
  SITE_QUOTA_EXCEEDED: "Limite de cités de l'offre atteinte",
  UNIT_QUOTA_EXCEEDED: "Limite d'unités de l'offre atteinte",
  USER_QUOTA_EXCEEDED: "Limite d'utilisateurs de l'offre atteinte",
  ACCOUNT_READ_ONLY: 'Compte en lecture seule (abonnement expiré)',

  // Paiement
  PAYMENT_DUPLICATE: 'Paiement déjà enregistré (clientId en double)',
  PAYMENT_AMOUNT_INVALID: 'Montant de paiement invalide',
  PAYMENT_ALREADY_VOIDED: 'Paiement déjà annulé',

  // Charges
  CHARGE_NOT_FOUND: 'Échéance introuvable',
  CHARGE_ALREADY_PAID: 'Échéance déjà soldée',
  CHARGE_PENALTY_DUPLICATE: 'Pénalité déjà générée pour cette échéance',

  // Occupation
  OCCUPANCY_UNIT_UNAVAILABLE: "L'unité n'est pas disponible",
  OCCUPANCY_OVERLAP: "Occupation en chevauchement sur l'unité",
  OCCUPANCY_ALREADY_CLOSED: 'Occupation déjà clôturée',

  // Locataires
  TENANT_NOT_FOUND: 'Locataire introuvable',
  TENANT_HAS_ACTIVE_OCCUPANCY:
    'Ce locataire occupe encore un logement avec des paiements : enregistrez d’abord sa sortie',

  // Tenancy / permissions
  TENANCY_MISSING_ACCOUNT: 'Contexte compte absent',
  FORBIDDEN_SITE: "Vous n'avez pas accès à ce site",

  // Fichiers
  FILE_TYPE_NOT_ALLOWED: 'Type de fichier non autorisé',
  FILE_TOO_LARGE: 'Fichier trop volumineux',

  // Validation
  VALIDATION_FAILED: 'Données invalides',

  // Interne
  INTERNAL_ERROR: 'Une erreur interne est survenue',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Payload d'erreur HTTP envoyé par l'API. */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  retryAfterSeconds?: number;
}
