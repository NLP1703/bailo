import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentMode } from '@prisma/client';
import { formatFcfa, renderTemplate } from '@bailo/shared';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PDF_RENDERER, type PdfRenderer, type RenderedDocument } from '../pdf/pdf.renderer';
import { StorageService } from '../files/storage.service';
import { buildReceiptHtml, type ReceiptLine } from './receipt-html';
import { buildContractHtml } from './contract-html';

/** Contrat par défaut si le bailleur n'a pas encore défini son modèle (F4.3). */
const DEFAULT_CONTRACT_FR =
  "Entre le bailleur {bailleur} et le/la locataire {nom}, il est convenu la location de l'unité {chambre} à compter du {date}.\n\n" +
  'Loyer mensuel : {montant}, payable le {jour} de chaque mois.\n' +
  'Caution versée : {caution}.\n\n' +
  "Le/la locataire s'engage à régler le loyer à l'échéance, à entretenir les lieux et à respecter le règlement intérieur. " +
  "Le présent document vaut fiche d'engagement de location.";

/** Numéro au format international sans « + » ni espaces pour l'URL wa.me. */
function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

const MODE_LABELS: Record<PaymentMode, string> = {
  ESPECES: 'Espèces',
  MTN_MOMO: 'MTN MoMo',
  ORANGE_MONEY: 'Orange Money',
  VIREMENT: 'Virement',
  AUTRE: 'Autre',
};

const CHARGE_LABELS: Record<string, string> = {
  LOYER: 'Loyer',
  CAUTION: 'Caution',
  EAU: 'Eau',
  ELECTRICITE: 'Électricité',
  FRAIS: 'Frais',
  PENALITE: 'Pénalité',
  REPARATION: 'Réparation',
};

function formatDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

export interface ReceiptVerification {
  authentic: boolean;
  receiptNumber?: string;
  amount?: number;
  date?: string;
}

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PDF_RENDERER) private readonly pdf: PdfRenderer,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly storage: StorageService,
  ) {}

  /** Rendu du reçu d'un paiement (PDF, ou HTML en repli sans Chromium). */
  async renderPayment(paymentId: string): Promise<{ doc: RenderedDocument; filename: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: true,
        occupancy: { include: { unit: true, tenant: true } },
      },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    const account = await this.prisma.account.findUnique({ where: { id: payment.accountId } });

    const charges = await this.prisma.charge.findMany({
      where: { id: { in: payment.allocations.map((a) => a.chargeId) } },
    });
    const chargeById = new Map(charges.map((c) => [c.id, c]));
    const lines: ReceiptLine[] = payment.allocations.map((a) => {
      const charge = chargeById.get(a.chargeId);
      const base = charge ? (CHARGE_LABELS[charge.type] ?? charge.type) : 'Règlement';
      const period =
        charge?.periodYear && charge.periodMonth
          ? ` ${String(charge.periodMonth).padStart(2, '0')}/${charge.periodYear}`
          : '';
      return { label: `${base}${period}`, amount: a.amount };
    });

    const html = buildReceiptHtml({
      accountName: account?.name ?? 'Bailo',
      receiptNumber: payment.receiptNumber,
      paidAtLabel: formatDate(payment.paidAt),
      amount: payment.amount,
      modeLabel: MODE_LABELS[payment.mode],
      payerName: payment.occupancy.tenant.name,
      unitCode: payment.occupancy.unit.code,
      lines,
      verifyUrl: `${this.env.PUBLIC_RECEIPT_BASE}/${payment.id}`,
      qrDataUrl: await this.qrDataUrl(`${this.env.PUBLIC_RECEIPT_BASE}/${payment.id}`),
      mentions: account?.receiptFooter ?? undefined,
      logoDataUrl: account?.logoKey
        ? await this.storage.fetchAsDataUri(account.logoKey)
        : undefined,
    });

    const doc = await this.pdf.render(html);
    const ext = doc.contentType === 'application/pdf' ? 'pdf' : 'html';
    return { doc, filename: `recu-${payment.receiptNumber}.${ext}` };
  }

  /** Contrat / fiche d'engagement d'une occupation (F4.3) — PDF, repli HTML. */
  async renderContract(occupancyId: string): Promise<{ doc: RenderedDocument; filename: string }> {
    const occ = await this.prisma.occupancy.findUnique({
      where: { id: occupancyId },
      include: { unit: true, tenant: true },
    });
    if (!occ) throw new NotFoundException('Occupation introuvable');
    const account = await this.prisma.account.findUnique({ where: { id: occ.accountId } });

    const template = await this.prisma.template.findFirst({
      where: { accountId: occ.accountId, kind: 'CONTRACT', locale: 'fr' },
      orderBy: { isDefault: 'desc' },
    });
    const body = renderTemplate(template?.bodyHtml ?? DEFAULT_CONTRACT_FR, {
      bailleur: account?.name ?? 'Bailo',
      nom: occ.tenant.name,
      chambre: occ.unit.code,
      montant: formatFcfa(occ.monthlyRent),
      caution: formatFcfa(occ.deposit),
      date: formatDate(occ.startDate),
      jour: String(occ.dueDay),
    });

    const html = buildContractHtml({
      accountName: account?.name ?? 'Bailo',
      logoDataUrl: account?.logoKey
        ? await this.storage.fetchAsDataUri(account.logoKey)
        : undefined,
      title: `Contrat de location — ${occ.unit.code}`,
      bodyHtml: body,
      mentions: account?.receiptFooter ?? undefined,
      signatureLandlord: 'Le bailleur',
      signatureTenant: 'Le/la locataire',
    });

    const doc = await this.pdf.render(html);
    const ext = doc.contentType === 'application/pdf' ? 'pdf' : 'html';
    return { doc, filename: `contrat-${occ.unit.code}.${ext}` };
  }

  /** Lien wa.me pré-rempli pour envoyer le reçu d'un paiement (F6.4). */
  async paymentWaLink(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { occupancy: { include: { tenant: { include: { guarantors: true } } } } },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');

    const verifyUrl = `${this.env.PUBLIC_RECEIPT_BASE}/${payment.id}`;
    const message =
      `Reçu N° ${payment.receiptNumber} — ${formatFcfa(payment.amount)} ` +
      `le ${formatDate(payment.paidAt)}. Vérifiez l'authenticité : ${verifyUrl}`;
    const text = encodeURIComponent(message);

    const tenant = payment.occupancy.tenant;
    const primaryPayer = tenant.guarantors.find((g) => g.isPrimaryPayer);
    const links: { to: string; phone: string; url: string }[] = [];
    const push = (to: string, phone?: string | null) => {
      if (phone) links.push({ to, phone, url: `https://wa.me/${sanitizePhone(phone)}?text=${text}` });
    };
    push('locataire', tenant.whatsapp ?? tenant.phone);
    push('parent', primaryPayer?.whatsapp ?? primaryPayer?.phone);

    return { paymentId, message, links };
  }

  /**
   * Vérification publique (QR) : renvoie UNIQUEMENT authentique/non, numéro, montant, date.
   * Aucune autre donnée personnelle (F6.4). Un paiement annulé n'est pas authentique.
   */
  async verify(paymentId: string): Promise<ReceiptVerification> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== 'VALID') {
      return { authentic: false };
    }
    return {
      authentic: true,
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      date: formatDate(payment.paidAt),
    };
  }

  /** QR en data-URL via `qrcode` (chargé paresseusement) ; absent si indisponible. */
  private async qrDataUrl(url: string): Promise<string | undefined> {
    try {
      const moduleName = 'qrcode';
      const qrcode = (await import(moduleName)) as unknown as {
        toDataURL: (text: string, opts?: unknown) => Promise<string>;
      };
      return await qrcode.toDataURL(url, { margin: 1, width: 96 });
    } catch {
      return undefined;
    }
  }
}
