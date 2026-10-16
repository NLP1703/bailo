import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Allocation, Payment, PaymentMode, Prisma } from '@prisma/client';
import {
  allocateFifo,
  validateManualAllocation,
  type AllocationLine,
  type CreatePaymentDto,
  type PreviewAllocationQuery,
  type VoidPaymentDto,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import { toDate } from '../../common/time/to-date';
import type { RequestContext } from '../../common/tenancy/request-context';
import { BalanceService } from '../finance/balance.service';
import { ReceiptNumberService } from '../finance/receipt-number.service';

export interface RecordPaymentParams {
  accountId: string;
  actorId: string;
  occupancyId: string;
  clientId: string;
  amount: number;
  mode: PaymentMode;
  reference?: string;
  paidAt: Date;
  proofKey?: string;
  receiptPrefix: string;
  manualAllocations?: AllocationLine[];
}

export interface PaymentResult {
  payment: Payment;
  allocations: Allocation[];
  idempotentReplay: boolean;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly receiptNumber: ReceiptNumberService,
    private readonly audit: AuditService,
    private readonly access: SiteAccessService,
  ) {}

  /** Encaissement public : ouvre une transaction et enregistre le paiement. */
  async record(ctx: RequestContext, dto: CreatePaymentDto): Promise<PaymentResult> {
    const occupancy = await this.prisma.occupancy.findUnique({
      where: { id: dto.occupancyId },
      include: { unit: { select: { siteId: true } } },
    });
    if (!occupancy) throw new NotFoundException('Occupation introuvable');
    // Gérant/gardien : encaissement limité à leurs sites assignés.
    await this.access.assertSiteAccess(ctx, occupancy.unit.siteId);
    const account = await this.prisma.account.findUnique({ where: { id: ctx.accountId } });

    return this.prisma.$transaction((tx) =>
      this.recordTx(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        occupancyId: dto.occupancyId,
        clientId: dto.clientId,
        amount: dto.amount,
        mode: dto.mode,
        reference: dto.reference,
        paidAt: toDate(dto.paidAt),
        proofKey: dto.proofKey,
        receiptPrefix: account?.receiptPrefix ?? 'CG',
        manualAllocations: dto.allocations,
      }),
    );
  }

  /**
   * Cœur de l'encaissement (dans une transaction).
   * Idempotent sur `clientId` (NF3) : un renvoi hors-ligne ne crée qu'un seul paiement.
   */
  async recordTx(
    tx: Prisma.TransactionClient,
    params: RecordPaymentParams,
  ): Promise<PaymentResult> {
    // Idempotence : si le clientId existe déjà, on renvoie le paiement existant.
    const existing = await tx.payment.findUnique({ where: { clientId: params.clientId } });
    if (existing) {
      const allocations = await tx.allocation.findMany({ where: { paymentId: existing.id } });
      return { payment: existing, allocations, idempotentReplay: true };
    }

    // Détermination des lignes d'affectation.
    const open = await this.balance.openCharges(tx, params.occupancyId);
    let lines: AllocationLine[];
    if (params.manualAllocations && params.manualAllocations.length > 0) {
      const remainingByCharge = new Map(open.map((c) => [c.chargeId, c.remaining]));
      validateManualAllocation(params.amount, params.manualAllocations, remainingByCharge);
      lines = params.manualAllocations;
    } else {
      lines = allocateFifo(params.amount, open).lines;
    }

    const receiptNumber = await this.receiptNumber.next(tx, {
      accountId: params.accountId,
      prefix: params.receiptPrefix,
      year: params.paidAt.getUTCFullYear(),
    });

    let payment: Payment;
    try {
      payment = await tx.payment.create({
        data: {
          accountId: params.accountId,
          occupancyId: params.occupancyId,
          clientId: params.clientId,
          amount: params.amount,
          mode: params.mode,
          reference: params.reference,
          paidAt: params.paidAt,
          receivedBy: params.actorId,
          proofKey: params.proofKey,
          receiptNumber,
          status: 'VALID',
        },
      });
    } catch (e) {
      // Course sur clientId → on retombe sur l'existant (idempotence).
      if (isUniqueViolation(e, 'clientId')) {
        const dup = await tx.payment.findUnique({ where: { clientId: params.clientId } });
        if (dup) {
          const allocations = await tx.allocation.findMany({ where: { paymentId: dup.id } });
          return { payment: dup, allocations, idempotentReplay: true };
        }
      }
      throw e;
    }

    const allocations: Allocation[] = [];
    for (const line of lines) {
      allocations.push(
        await tx.allocation.create({
          data: {
            accountId: params.accountId,
            paymentId: payment.id,
            chargeId: line.chargeId,
            amount: line.amount,
          },
        }),
      );
    }

    await this.audit.log(tx, {
      accountId: params.accountId,
      actorId: params.actorId,
      entity: 'payment',
      entityId: payment.id,
      action: 'CREATE',
      after: {
        amount: payment.amount,
        mode: payment.mode,
        receiptNumber,
        allocations: lines,
      },
    });

    return { payment, allocations, idempotentReplay: false };
  }

  /** Annulation par écriture d'annulation motivée — jamais de suppression (RG8). */
  async void(ctx: RequestContext, paymentId: string, dto: VoidPaymentDto): Promise<Payment> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundException('Paiement introuvable');
      if (payment.status === 'VOIDED') {
        throw new ConflictException('Paiement déjà annulé');
      }
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'VOIDED',
          voidReason: dto.reason,
          voidedAt: new Date(),
          voidedBy: ctx.userId,
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'payment',
        entityId: paymentId,
        action: 'VOID',
        before: { status: 'VALID' },
        after: { status: 'VOIDED' },
        reason: dto.reason,
      });
      return updated;
    });
  }

  /** Aperçu de l'affectation avant validation (écran Encaisser). */
  async preview(ctx: RequestContext, query: PreviewAllocationQuery) {
    const occupancy = await this.prisma.occupancy.findUnique({ where: { id: query.occupancyId } });
    if (!occupancy) throw new NotFoundException('Occupation introuvable');
    const open = await this.balance.openCharges(this.prisma, query.occupancyId);
    const { lines, leftover } = allocateFifo(query.amount, open);
    const charges = await this.prisma.charge.findMany({
      where: { id: { in: lines.map((l) => l.chargeId) } },
    });
    const byId = new Map(charges.map((c) => [c.id, c]));
    return {
      amount: query.amount,
      leftover,
      lines: lines.map((l) => {
        const charge = byId.get(l.chargeId);
        return {
          chargeId: l.chargeId,
          amount: l.amount,
          type: charge?.type,
          periodYear: charge?.periodYear,
          periodMonth: charge?.periodMonth,
        };
      }),
    };
  }

  async get(paymentId: string): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: true },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    return payment;
  }
}

function isUniqueViolation(error: unknown, field: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002' &&
    JSON.stringify((error as { meta?: unknown }).meta ?? '').includes(field)
  );
}
