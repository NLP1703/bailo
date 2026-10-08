// RG18 : couleur « vivante » d'une unité.
//   rouge  : au moins une échéance en retard
//   orange : une échéance due dans les 3 jours (et rien en retard)
//   vert   : occupée et à jour
//   gris   : libre (ou indisponible)
//   bleu   : réservée
//
// Le calcul de terrain (sur 100+ unités) est fait par la vue SQL `unit_status_v` ;
// cette fonction encode la même règle pour les tests et un usage ponctuel.

import type { UnitColor, UnitManualStatus } from '../enums';

export interface UnitColorInput {
  manualStatus: UnitManualStatus;
  hasActiveOccupancy: boolean;
  hasOverdueCharge: boolean;
  hasDueSoonCharge: boolean; // échéance ouverte due dans 0..3 jours
}

export function computeUnitColor(input: UnitColorInput): UnitColor {
  if (input.manualStatus === 'RESERVED') return 'BLUE';
  if (input.manualStatus === 'UNAVAILABLE') return 'GREY';
  if (!input.hasActiveOccupancy) return 'GREY'; // libre
  if (input.hasOverdueCharge) return 'RED';
  if (input.hasDueSoonCharge) return 'ORANGE';
  return 'GREEN';
}
