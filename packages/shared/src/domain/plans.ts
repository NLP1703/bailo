// Offres & règles d'abonnement Bailo (M9 §9).
// Prix en FCFA, marché Cameroun (paiement Mobile Money en V2).
import type { SubscriptionPlan } from '../enums';

/** Fonctionnalités activables par offre. Un drapeau à false => la feature est
 *  verrouillée pour les comptes sur cette offre. */
export interface PlanFeatures {
  /** Relances automatiques via WhatsApp. */
  whatsapp: boolean;
  /** Relances automatiques via SMS. */
  sms: boolean;
  /** Toutes les étapes de relance (J-3, J0, J+5, J+15, Fin d'avance).
   *  Si false, seules J-3 et J0 sont actives. */
  allReminderStages: boolean;
  /** Pénalités de retard automatiques (fixes ou %). */
  penaltiesAuto: boolean;
  /** Rapports avancés (arriérés par site, cash flow, top retards, export comptable). */
  advancedReports: boolean;
  /** Reçus sans filigrane « Fait avec Bailo ». */
  noWatermark: boolean;
  /** Gérant multi-bailleurs (bascule entre plusieurs comptes). */
  multiAccount: boolean;
  /** API / webhooks pour alimenter un logiciel comptable externe. */
  apiAccess: boolean;
  /** Marque blanche (logo du gérant à côté de Bailo). */
  whiteLabel: boolean;
  /** Historique conservé, en mois ; null = illimité. */
  historyMonths: number | null;
}

export interface PlanLimits {
  /** Nombre maximum de cités / immeubles ; null = illimité. */
  maxSites: number | null;
  /** Nombre maximum d'unités facturables ; null = illimité. */
  maxUnits: number | null;
  /** Nombre maximum d'utilisateurs ; null = illimité. */
  maxUsers: number | null;
  /** Prix indicatif par unité et par mois (0 = plan forfaitaire). Conservé
   *  pour compatibilité des calculs historiques. */
  pricePerUnit: number;
  /** Prix mensuel forfaitaire (FCFA). 0 = gratuit. */
  pricePerMonth: number;
  /** Prix annuel (FCFA). 0 = gratuit ; sinon = 10× prix mensuel (2 mois offerts). */
  pricePerYear: number;
  /** Fonctionnalités activées pour l'offre. */
  features: PlanFeatures;
}

const F = (overrides: Partial<PlanFeatures>): PlanFeatures => ({
  whatsapp: false,
  sms: false,
  allReminderStages: false,
  penaltiesAuto: false,
  advancedReports: false,
  noWatermark: false,
  multiAccount: false,
  apiAccess: false,
  whiteLabel: false,
  historyMonths: 1,
  ...overrides,
});

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  DISCOVERY: {
    maxSites: 1,
    maxUnits: 5,
    maxUsers: 1,
    pricePerUnit: 0,
    pricePerMonth: 0,
    pricePerYear: 0,
    features: F({ historyMonths: 1 }),
  },
  CITE: {
    maxSites: 1,
    maxUnits: 30,
    maxUsers: 2,
    pricePerUnit: 0,
    pricePerMonth: 9_900,
    pricePerYear: 99_000,
    features: F({
      whatsapp: true,
      noWatermark: true,
      historyMonths: 12,
    }),
  },
  CITE_PRO: {
    maxSites: 3,
    maxUnits: 150,
    maxUsers: 5,
    pricePerUnit: 0,
    pricePerMonth: 18_900,
    pricePerYear: 189_000,
    features: F({
      whatsapp: true,
      sms: true,
      allReminderStages: true,
      penaltiesAuto: true,
      advancedReports: true,
      noWatermark: true,
      historyMonths: null,
    }),
  },
  MANAGER: {
    maxSites: null,
    maxUnits: null,
    maxUsers: null,
    pricePerUnit: 0,
    pricePerMonth: 45_900,
    pricePerYear: 459_000,
    features: F({
      whatsapp: true,
      sms: true,
      allReminderStages: true,
      penaltiesAuto: true,
      advancedReports: true,
      noWatermark: true,
      multiAccount: true,
      apiAccess: true,
      whiteLabel: true,
      historyMonths: null,
    }),
  },
};

/** Ordre d'affichage canonique (du moins cher au plus cher). */
export const PLAN_ORDER: readonly SubscriptionPlan[] = [
  'DISCOVERY',
  'CITE',
  'CITE_PRO',
  'MANAGER',
];

/** Délai de grâce (jours) après échéance avant lecture seule (§9.1). */
export const SUBSCRIPTION_GRACE_DAYS = 7;

/** Durée de l'essai Cité Pro offert à l'inscription (§9.1). */
export const TRIAL_DAYS = 30;

/** Vrai si le compte doit passer en lecture seule (abonnement payant échu
 *  depuis plus que le délai de grâce). Découverte n'est jamais en lecture seule. */
export function isAccountReadOnly(
  plan: SubscriptionPlan,
  subscriptionEndAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (plan === 'DISCOVERY') return false;
  if (!subscriptionEndAt) return false;
  const deadline = new Date(subscriptionEndAt.getTime() + SUBSCRIPTION_GRACE_DAYS * 86_400_000);
  return now.getTime() > deadline.getTime();
}

/** Lecture pratique d'un flag — centralise les futures évolutions. */
export function planHasFeature<K extends keyof PlanFeatures>(
  plan: SubscriptionPlan,
  feature: K,
): PlanFeatures[K] {
  return PLAN_LIMITS[plan].features[feature];
}
