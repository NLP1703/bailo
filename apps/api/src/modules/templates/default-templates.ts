import type { ReminderStage } from '@bailo/shared';

/**
 * Messages de relance par défaut (FR/EN), utilisés tant qu'aucun modèle personnalisé
 * n'existe. Variables : {nom} {chambre} {montant} {date} (F7.2).
 */
export const DEFAULT_REMINDER_MESSAGES: Record<ReminderStage, { fr: string; en: string }> = {
  J_MINUS_3: {
    fr: 'Bonjour {nom}, rappel amical : le loyer de la chambre {chambre} ({montant}) est dû le {date}. Merci.',
    en: 'Hello {nom}, friendly reminder: rent for room {chambre} ({montant}) is due on {date}. Thank you.',
  },
  J_0: {
    fr: 'Bonjour {nom}, le loyer de la chambre {chambre} ({montant}) est dû aujourd’hui {date}. Merci de régler.',
    en: 'Hello {nom}, rent for room {chambre} ({montant}) is due today {date}. Please settle it.',
  },
  J_PLUS_5: {
    fr: 'Bonjour {nom}, le loyer de la chambre {chambre} ({montant}) échu le {date} est impayé. Merci de régulariser.',
    en: 'Hello {nom}, rent for room {chambre} ({montant}) due on {date} is unpaid. Please regularize.',
  },
  J_PLUS_15: {
    fr: 'Bonjour {nom}, relance : le loyer de la chambre {chambre} ({montant}) est en retard depuis le {date}. Merci de régler rapidement.',
    en: 'Hello {nom}, reminder: rent for room {chambre} ({montant}) has been overdue since {date}. Please pay promptly.',
  },
  END_OF_ADVANCE: {
    fr: 'Bonjour {nom}, votre avance pour la chambre {chambre} se termine bientôt ({date}). Pensez à renouveler.',
    en: 'Hello {nom}, your advance for room {chambre} ends soon ({date}). Please plan to renew.',
  },
};
