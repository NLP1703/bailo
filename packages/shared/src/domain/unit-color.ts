// RG18 : couleur « vivante » d'une unité.
//   rouge  : au moins une échéance en retard
//   orange : une échéance due dans les 3 jours (et rien en retard)
//   vert   : occupée et à jour
//   gris   : libre (ou indisponible SANS occupation)
//   bleu   : réservée
//
// Priorité : RESERVED (intentionnel, posé à la main) > occupation active > manualStatus.
// Une occupation active prend donc le dessus sur UNAVAILABLE : si une chambre a un
// locataire actif, elle DOIT apparaître colorée selon son état financier — on refuse
// qu'un ancien UNAVAILABLE oublié masque la réalité (audit : bug observé sur MAUD/C01).
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
  if (input.hasActiveOccupancy) {
    if (input.hasOverdueCharge) return 'RED';
    if (input.hasDueSoonCharge) return 'ORANGE';
    return 'GREEN';
  }
  // Pas d'occupation : UNAVAILABLE et AVAILABLE sont tous deux « non occupés » → gris.
  return 'GREY';
}
