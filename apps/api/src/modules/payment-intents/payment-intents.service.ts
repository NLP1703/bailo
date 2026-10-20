import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PaymentIntent } from '@prisma/client';
import type {
  CreatePaymentIntentDto,
  PaymentIntentListQuery,
  ProviderWebhookDto,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/tenancy/request-context';
import { PaymentProviderRegistry } from './providers/provider.registry';
import { PaymentsService } from '../payments/payments.service';
import { loadEnv } from '../../common/config/env';

@Injectable()
export class PaymentIntentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: PaymentProviderRegistry,
    private readonly payments: PaymentsService,
  ) {}

  /** Déclenche une collecte MoMo/OM côté opérateur et stocke l'intent. */
  async create(ctx: RequestContext, dto: CreatePaymentIntentDto): Promise<PaymentIntent> {
    const occupancy = await this.prisma.occupancy.findUnique({
      where: { id: dto.occupancyId },
      include: { tenant: { select: { name: true } }, unit: { select: { code: true } } },
    });
    if (!occupancy) throw new NotFoundException('Occupation introuvable');
    const existing = await this.prisma.paymentIntent.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return existing;

    const provider = this.registry.get(dto.provider);
    const intent = await this.prisma.paymentIntent.create({
      data: {
        accountId: ctx.accountId,
        occupancyId: dto.occupancyId,
        provider: dto.provider,
        phone: dto.phone,
        amount: dto.amount,
        currency: dto.currency ?? 'XAF',
        status: 'PENDING',
        requestedBy: ctx.userId,
        allocationPlan: (dto.allocationPlan ?? undefined) as Prisma.InputJsonValue | undefined,
        idempotencyKey: dto.idempotencyKey,
      },
    });

    const env = loadEnv();
    const callbackUrl = `${env.PUBLIC_API_URL}/api/v1/payment-intents/webhook/${dto.provider.toLowerCase()}`;
    const reference = `Bailo ${occupancy.unit.code} ${occupancy.tenant.name}`.slice(0, 40);
    try {
      const res = await provider.initiate({
        intentId: intent.id,
        phone: dto.phone,
        amount: dto.amount,
        currency: intent.currency,
        callbackUrl,
        reference,
      });
      return this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: res.status, providerRef: res.providerRef, statusMessage: res.statusMessage },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur provider';
      return this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', statusMessage: msg },
      });
    }
  }

  async list(ctx: RequestContext, q: PaymentIntentListQuery): Promise<PaymentIntent[]> {
    return this.prisma.paymentIntent.findMany({
      where: {
        accountId: ctx.accountId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.occupancyId ? { occupancyId: q.occupancyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    });
  }

  /**
   * Reçoit un webhook signé d'un provider et clôture l'intent :
   * - SUCCEEDED → crée automatiquement un Payment (via PaymentsService), lié à l'intent.
   * - FAILED/CANCELLED → marque l'intent avec le message et log d'audit.
   */
  async handleWebhook(providerName: string, event: ProviderWebhookDto): Promise<void> {
    const intent = await this.prisma.paymentIntent.findFirst({
      where: {
        // Cast ciblé : `providerName` est validé en amont, l'enum Prisma n'est
        // pas exposé ici.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: providerName.toUpperCase() as any,
        providerRef: event.providerRef,
      },
      include: { account: true },
    });
    if (!intent) throw new NotFoundException('Intent inconnu pour ce providerRef');
    if (intent.status === 'SUCCEEDED') return; // idempotent

    if (event.status === 'SUCCEEDED') {
      await this.prisma.$transaction(async (tx) => {
        const paid = await this.payments.recordTx(tx, {
          accountId: intent.accountId,
          actorId: intent.requestedBy,
          occupancyId: intent.occupancyId,
          clientId: intent.idempotencyKey,
          amount: intent.amount,
          mode: intent.provider === 'ORANGE_MONEY' ? 'ORANGE_MONEY' : 'MTN_MOMO',
          reference: intent.providerRef ?? undefined,
          paidAt: new Date(),
          receiptPrefix: intent.account.receiptPrefix,
          // `allocationPlan` est stocké en JSON Prisma ; forme libre consommée
          // par `PaymentsService` qui ré-attache ses propres types.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          manualAllocations: (intent.allocationPlan as any) ?? undefined,
        });
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: {
            status: 'SUCCEEDED',
            statusMessage: event.statusMessage ?? 'Paiement confirmé par le provider',
            completedAt: new Date(),
            webhookPayload: event as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.payment.update({
          where: { id: paid.payment.id },
          data: { paymentIntentId: intent.id },
        });
        await this.audit.log(tx, {
          accountId: intent.accountId,
          actorId: intent.requestedBy,
          entity: 'payment_intent',
          entityId: intent.id,
          action: 'UPDATE',
          after: { status: 'SUCCEEDED', paymentId: paid.payment.id },
        });
      });
    } else {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: event.status,
          statusMessage: event.statusMessage,
          completedAt: new Date(),
          webhookPayload: event as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
}
