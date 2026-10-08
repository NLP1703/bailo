// RG11–RG13 : cadence des relances.
//
// RG11 — paliers par défaut J-3 (rappel), J0 (échéance), J+5 et J+15 (retard) ;
//        chaque palier est activable par site.
// RG12 — jamais de relance pour une échéance déjà payée, ni entre 21 h et 7 h (envoi).
// RG13 — un locataire en avance ne reçoit pas de relance, mais un rappel « fin d'avance »
//        30 jours avant le dernier mois couvert.

import type { ReminderStage } from '../enums';
import { diffDays } from './dates';

/** Décalage en jours (par rapport à la date d'échéance) de chaque palier de relance. */
export const REMINDER_OFFSETS: Record<'J_MINUS_3' | 'J_0' | 'J_PLUS_5' | 'J_PLUS_15', number> = {
  J_MINUS_3: -3,
  J_0: 0,
  J_PLUS_5: 5,
  J_PLUS_15: 15,
};

/** Palier correspondant à un nombre de jours (échéance = J0), ou null si aucun. */
export function stageForDaysPastDue(daysPastDue: number): ReminderStage | null {
  switch (daysPastDue) {
    case -3:
      return 'J_MINUS_3';
    case 0:
      return 'J_0';
    case 5:
      return 'J_PLUS_5';
    case 15:
      return 'J_PLUS_15';
    default:
      return null;
  }
}

export interface SitePaliers {
  reminderJm3: boolean;
  reminderJ0: boolean;
  reminderJp5: boolean;
  reminderJp15: boolean;
}

/** Le palier est-il activé sur ce site (RG11) ? */
export function isStageEnabled(stage: ReminderStage, paliers: SitePaliers): boolean {
  switch (stage) {
    case 'J_MINUS_3':
      return paliers.reminderJm3;
    case 'J_0':
      return paliers.reminderJ0;
    case 'J_PLUS_5':
      return paliers.reminderJp5;
    case 'J_PLUS_15':
      return paliers.reminderJp15;
    default:
      return true;
  }
}

/**
 * Palier de relance dû aujourd'hui pour une échéance donnée, ou null.
 * Ne renvoie rien si l'échéance est payée/annulée (RG12) ou si le palier est désactivé (RG11).
 */
export function dueReminderStage(input: {
  dueDate: Date;
  today: Date;
  remaining: number;
  cancelled: boolean;
  paliers: SitePaliers;
}): ReminderStage | null {
  if (input.cancelled || input.remaining <= 0) return null;
  const stage = stageForDaysPastDue(diffDays(input.dueDate, input.today));
  if (!stage) return null;
  return isStageEnabled(stage, input.paliers) ? stage : null;
}

/** Heures « silencieuses » : pas d'envoi entre 21 h et 7 h (RG12). */
export function isQuietHours(hour: number): boolean {
  return hour >= 21 || hour < 7;
}

/**
 * Rappel « fin d'avance » (RG13) : dû lorsque la couverture de loyer se termine
 * dans exactement 30 jours (le locataire est en avance mais elle expire bientôt).
 */
export function isEndOfAdvanceDay(coverageEndDate: Date, today: Date): boolean {
  return diffDays(today, coverageEndDate) === 30;
}

/** Substitution des variables d'un modèle : {nom} {chambre} {montant} {date}… (F7.2). */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : match,
  );
}
