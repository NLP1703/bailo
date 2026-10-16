import { Injectable } from '@nestjs/common';
import type { SyncPullQuery, SyncPushDto } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toDate } from '../../common/time/to-date';
import type { RequestContext } from '../../common/tenancy/request-context';
import { PaymentsService } from '../payments/payments.service';

export interface SyncPushResult {
  clientId: string;
  status: 'ok' | 'error';
  paymentId?: string;
  idempotentReplay?: boolean;
  error?: string;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Rejoue la file hors-ligne (NF3). Chaque paiement est idempotent sur son `clientId` :
   * plusieurs pushes du même lot n'enregistrent jamais de doublon.
   */
  async push(ctx: RequestContext, dto: SyncPushDto): Promise<{ results: SyncPushResult[] }> {
    const results: SyncPushResult[] = [];
    for (const payment of dto.payments) {
      try {
        const res = await this.payments.record(ctx, payment);
        results.push({
          clientId: payment.clientId,
          status: 'ok',
          paymentId: res.payment.id,
          idempotentReplay: res.idempotentReplay,
        });
      } catch (error) {
        results.push({
          clientId: payment.clientId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Échec',
        });
      }
    }
    return { results };
  }

  /**
   * Delta pour le cache local : entités modifiées depuis `since` (ou tout si absent).
   * Le cloisonnement par compte est appliqué automatiquement (NF7).
   */
  async pull(_ctx: RequestContext, query: SyncPullQuery) {
    const since = query.since ? toDate(query.since) : undefined;
    const where = since ? { updatedAt: { gt: since } } : {};

    const [sites, blocks, units, tenants, guarantors, occupancies, charges, payments] =
      await Promise.all([
        this.prisma.site.findMany({ where }),
        this.prisma.block.findMany({ where }),
        this.prisma.unit.findMany({ where }),
        this.prisma.tenant.findMany({ where }),
        this.prisma.guarantor.findMany({ where }),
        this.prisma.occupancy.findMany({ where }),
        this.prisma.charge.findMany({ where }),
        this.prisma.payment.findMany({ where }),
      ]);

    return {
      serverTime: new Date().toISOString(),
      sites,
      blocks,
      units,
      tenants,
      guarantors,
      occupancies,
      charges,
      payments,
    };
  }
}
