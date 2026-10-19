// Export comptable OHADA / SYSCOHADA.
import { z } from 'zod';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const ohadaExportQuery = z.object({
  from: isoDate,
  to: isoDate,
  /** Format du journal exporté. */
  format: z.enum(['CSV', 'XLSX']).default('CSV'),
});
export type OhadaExportQuery = z.infer<typeof ohadaExportQuery>;

/** Mapping comptes OHADA utilisés par Bailo (minimal, non audité). */
export const OHADA_ACCOUNTS = {
  CAISSE: '571',           // Caisse
  BANQUE: '521',           // Banques
  MOBILE_MONEY: '585',     // Instruments de trésorerie — Mobile money
  LOYER_PRODUIT: '706',    // Prestations de services (loyers)
  CAUTION_RECUE: '4194',   // Dépôts de garantie reçus
  CHARGES_REFACT: '708',   // Produits des activités annexes (eau/élec refacturée)
  ENTRETIEN: '624',        // Entretien et réparations
  TAXES: '646',            // Impôts et taxes
  PERSONNEL: '661',        // Rémunérations directes
  ASSURANCES: '625',       // Primes d'assurance
  FOURNITURES: '604',      // Achats stockés — matières et fournitures
  DIVERS: '628',           // Divers services extérieurs
} as const;
