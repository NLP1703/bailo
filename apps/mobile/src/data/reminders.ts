import { dueReminderStage, type ReminderStage } from '@bailo/shared';
import { formatFcfa, shortDate } from '../ui/format';
import type { ChargeView, GuarantorRow, SiteTables, TenantRow, UnitView } from './types';

export interface ReminderRecipient {
  name: string;
  phone: string | null;
  /** « au locataire », « au père (payeur) »… */
  label: string;
}

export interface ReminderItem {
  /** Clé stable du jour : échéance + palier (ou chambre pour les autres retards). */
  key: string;
  kind: 'late' | 'upcoming';
  stage: ReminderStage | null;
  view: UnitView;
  charge: ChargeView | null;
  amount: number;
  recipient: ReminderRecipient;
  message: string;
}

/** Destinataire d'une relance : le payeur principal s'il y en a un, sinon le locataire. */
export function recipientOf(tenant: TenantRow, guarantors: GuarantorRow[]): ReminderRecipient {
  const payer = guarantors.find((g) => g.tenantId === tenant.id && g.isPrimaryPayer);
  if (payer) {
    return {
      name: payer.name,
      phone: payer.whatsapp ?? payer.phone,
      label: `${payer.relationship ? `au ${payer.relationship.toLowerCase()}` : 'au payeur'} (payeur)`,
    };
  }
  return { name: tenant.name, phone: tenant.whatsapp ?? tenant.phone, label: 'au locataire' };
}

/** Nom complet : un prénom seul (« Bonjour Martin ») ou un libellé (« Parent de… ») sonne faux. */
function greeting(name: string): string {
  return `Bonjour ${name.trim()}`;
}

/**
 * Relances du jour (T9), calculées sur le téléphone avec la règle du serveur : paliers
 * J−3, J0, J+5, J+15 activables par site (RG11), rien sur une échéance réglée (RG12).
 * S'y ajoutent les autres chambres en retard, à relancer à la main si besoin.
 */
export function remindersForToday(
  tables: SiteTables,
  units: UnitView[],
  today: Date,
): ReminderItem[] {
  const site = tables.sites[0];
  if (!site) return [];
  const siteName = site.name;
  const items: ReminderItem[] = [];
  const withStage = new Set<string>();

  for (const view of units) {
    if (!view.occupancy || !view.tenant) continue;
    const recipient = recipientOf(view.tenant, tables.guarantors);
    for (const charge of view.openCharges) {
      const stage = dueReminderStage({
        dueDate: new Date(charge.dueDate),
        today,
        remaining: charge.remaining,
        cancelled: charge.status === 'CANCELLED',
        paliers: site,
      });
      if (!stage) continue;
      withStage.add(view.unit.id);
      const late = stage === 'J_PLUS_5' || stage === 'J_PLUS_15';
      const amount = late ? view.due : charge.remaining;
      items.push({
        key: `${charge.id}:${stage}`,
        kind: late ? 'late' : 'upcoming',
        stage,
        view,
        charge,
        amount,
        recipient,
        message: late
          ? `${greeting(recipient.name)}, le loyer de la chambre ${view.unit.code} (${view.tenant.name}) présente un retard de ${formatFcfa(amount)}. Merci de régulariser. — ${siteName}`
          : stage === 'J_0'
            ? `${greeting(recipient.name)}, le loyer de la chambre ${view.unit.code} (${formatFcfa(amount)}) est attendu aujourd’hui. Merci. — ${siteName}`
            : `${greeting(recipient.name)}, petit rappel : le loyer de la chambre ${view.unit.code} (${formatFcfa(amount)}) est attendu le ${shortDate(charge.dueDate)}. Merci. — ${siteName}`,
      });
    }
  }

  for (const view of units) {
    if (view.color !== 'RED' || !view.tenant || withStage.has(view.unit.id)) continue;
    const recipient = recipientOf(view.tenant, tables.guarantors);
    items.push({
      key: `unit:${view.unit.id}`,
      kind: 'late',
      stage: null,
      view,
      charge: null,
      amount: view.due,
      recipient,
      message: `${greeting(recipient.name)}, le loyer de la chambre ${view.unit.code} (${view.tenant.name}) présente un retard de ${formatFcfa(view.due)}. Merci de régulariser. — ${siteName}`,
    });
  }
  return items;
}
