import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentMode } from '@prisma/client';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PDF_RENDERER, type PdfRenderer, type RenderedDocument } from '../pdf/pdf.renderer';
import { StorageService } from '../files/storage.service';
import { buildReceiptHtml, type ReceiptLine } from './receipt-html';

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
      accountName: account?.name ?? 'CitéGest',
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
