import { Injectable } from '@nestjs/common';
import { OHADA_ACCOUNTS, type OhadaExportQuery } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestContext } from '../../common/tenancy/request-context';
import { toDate } from '../../common/time/to-date';

export type JournalRow = {
  date: string;
  piece: string;
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
};
type Row = JournalRow;

/** Résumé d'un journal : lignes + totaux + grand livre simplifié par compte. */
export interface JournalSummary {
  rows: Row[];
  totals: { debit: number; credit: number; delta: number };
  byAccount: { compte: string; libelle: string; debit: number; credit: number; solde: number }[];
}

/** Libellés usuels des comptes OHADA utilisés par Bailo (affichés dans le grand livre). */
const ACCOUNT_LABELS: Record<string, string> = {
  '571': 'Caisse',
  '521': 'Banques',
  '585': 'Mobile Money',
  '706': 'Loyers',
  '708': 'Charges refacturées',
  '4194': 'Dépôts de garantie reçus',
  '4191': 'Clients — avances',
  '624': 'Entretien et réparations',
  '625': 'Assurances',
  '604': 'Fournitures',
  '628': 'Services divers',
  '646': 'Impôts et taxes',
  '661': 'Rémunérations',
};

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Produit les écritures OHADA (débit/crédit) sur une période pour export CSV/XLSX. */
  async journal(ctx: RequestContext, q: OhadaExportQuery): Promise<Row[]> {
    const from = toDate(q.from);
    const to = toDate(q.to);
    const rows: Row[] = [];

    // Recettes : paiements valides → crédit 706 (loyer), débit 571/585 selon le mode.
    const payments = await this.prisma.payment.findMany({
      where: { accountId: ctx.accountId, status: 'VALID', paidAt: { gte: from, lte: to } },
      include: {
        occupancy: { include: { tenant: { select: { name: true } }, unit: { select: { code: true } } } },
        allocations: { include: { charge: { select: { type: true } } } },
      },
      orderBy: { paidAt: 'asc' },
    });
    for (const p of payments) {
      const compteTreso =
        p.mode === 'ESPECES'
          ? OHADA_ACCOUNTS.CAISSE
          : p.mode === 'VIREMENT'
            ? OHADA_ACCOUNTS.BANQUE
            : OHADA_ACCOUNTS.MOBILE_MONEY;
      const d = p.paidAt.toISOString().slice(0, 10);
      const label = `Loyer ${p.occupancy.unit.code} ${p.occupancy.tenant.name}`;
      rows.push({ date: d, piece: p.receiptNumber, compte: compteTreso, libelle: label, debit: p.amount, credit: 0 });
      // Ventilation produit selon le type d'échéance (CAUTION → 4194, EAU/ELEC → 708, autres → 706).
      const totalByType = new Map<string, number>();
      for (const a of p.allocations) {
        const t = a.charge.type;
        totalByType.set(t, (totalByType.get(t) ?? 0) + a.amount);
      }
      for (const [type, amount] of totalByType) {
        const compte =
          type === 'CAUTION'
            ? OHADA_ACCOUNTS.CAUTION_RECUE
            : type === 'EAU' || type === 'ELECTRICITE'
              ? OHADA_ACCOUNTS.CHARGES_REFACT
              : OHADA_ACCOUNTS.LOYER_PRODUIT;
        rows.push({ date: d, piece: p.receiptNumber, compte, libelle: `${label} — ${type}`, debit: 0, credit: amount });
      }
      // Reliquat non alloué (acompte) : crédité en 419 comptes clients (approximation).
      const allocated = p.allocations.reduce((s, a) => s + a.amount, 0);
      if (allocated < p.amount) {
        rows.push({ date: d, piece: p.receiptNumber, compte: '4191', libelle: `${label} — avance`, debit: 0, credit: p.amount - allocated });
      }
    }

    // Dépenses : charges diverses selon catégorie — compte débité, caisse créditée.
    const expenses = await this.prisma.expense.findMany({
      where: { accountId: ctx.accountId, spentAt: { gte: from, lte: to } },
      orderBy: { spentAt: 'asc' },
    });
    for (const e of expenses) {
      const compte =
        e.category === 'MAINTENANCE'
          ? OHADA_ACCOUNTS.ENTRETIEN
          : e.category === 'TAX'
            ? OHADA_ACCOUNTS.TAXES
            : e.category === 'SALARY'
              ? OHADA_ACCOUNTS.PERSONNEL
              : e.category === 'INSURANCE'
                ? OHADA_ACCOUNTS.ASSURANCES
                : e.category === 'SUPPLIES'
                  ? OHADA_ACCOUNTS.FOURNITURES
                  : e.category === 'UTILITIES'
                    ? OHADA_ACCOUNTS.CHARGES_REFACT
                    : OHADA_ACCOUNTS.DIVERS;
      const d = e.spentAt.toISOString().slice(0, 10);
      rows.push({ date: d, piece: `EXP-${e.id.slice(0, 8)}`, compte, libelle: e.label, debit: e.amount, credit: 0 });
      rows.push({ date: d, piece: `EXP-${e.id.slice(0, 8)}`, compte: OHADA_ACCOUNTS.CAISSE, libelle: e.label, debit: 0, credit: e.amount });
    }

    return rows;
  }

  csv(rows: Row[]): string {
    const header = 'Date;Pièce;Compte;Libellé;Débit (XAF);Crédit (XAF)';
    const lines = rows.map((r) =>
      [r.date, r.piece, r.compte, r.libelle.replace(/;/g, ','), r.debit, r.credit].join(';'),
    );
    return [header, ...lines].join('\n');
  }

  /** Agrège un ensemble de lignes en totaux + grand livre par compte. */
  summarize(rows: Row[]): JournalSummary {
    const totals = rows.reduce(
      (acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit, delta: 0 }),
      { debit: 0, credit: 0, delta: 0 },
    );
    totals.delta = totals.debit - totals.credit;

    const byAccountMap = new Map<string, { debit: number; credit: number }>();
    for (const r of rows) {
      const cur = byAccountMap.get(r.compte) ?? { debit: 0, credit: 0 };
      cur.debit += r.debit;
      cur.credit += r.credit;
      byAccountMap.set(r.compte, cur);
    }
    const byAccount = Array.from(byAccountMap.entries())
      .map(([compte, v]) => ({
        compte,
        libelle: ACCOUNT_LABELS[compte] ?? `Compte ${compte}`,
        debit: v.debit,
        credit: v.credit,
        solde: v.debit - v.credit,
      }))
      .sort((a, b) => a.compte.localeCompare(b.compte));

    return { rows, totals, byAccount };
  }
}
