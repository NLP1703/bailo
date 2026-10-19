import { Injectable } from '@nestjs/common';
import type { ExchangeRate } from '@prisma/client';
import type { Currency as CurrencyEnum } from '@prisma/client';
import type { SetExchangeRateDto, UpdateAccountCurrencyDto } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestContext } from '../../common/tenancy/request-context';

/**
 * Taux par défaut (approximatifs 2026) — utilisés quand le bailleur n'a saisi aucun
 * taux pour une paire. On n'appelle aucun service externe (pas de dépendance).
 */
const DEFAULT_RATES: Partial<Record<`${CurrencyEnum}-${CurrencyEnum}`, number>> = {
  'XAF-EUR': 1 / 655.957, // taux fixe BCEAO/BEAC
  'EUR-XAF': 655.957,
  'XAF-USD': 1 / 600,
  'USD-XAF': 600,
  'XAF-CAD': 1 / 445,
  'CAD-XAF': 445,
  'XAF-GBP': 1 / 785,
  'GBP-XAF': 785,
};

@Injectable()
export class CurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: RequestContext): Promise<ExchangeRate[]> {
    return this.prisma.exchangeRate.findMany({
      where: { accountId: ctx.accountId },
      orderBy: [{ base: 'asc' }, { quote: 'asc' }],
    });
  }

  async setRate(ctx: RequestContext, dto: SetExchangeRateDto): Promise<ExchangeRate> {
    return this.prisma.exchangeRate.upsert({
      where: {
        accountId_base_quote: {
          accountId: ctx.accountId,
          base: dto.base,
          quote: dto.quote,
        },
      },
      create: { ...dto, accountId: ctx.accountId, createdBy: ctx.userId, asOf: new Date() },
      update: { rate: dto.rate, asOf: new Date() },
    });
  }

  async updateAccountPreferences(ctx: RequestContext, dto: UpdateAccountCurrencyDto) {
    return this.prisma.account.update({
      where: { id: ctx.accountId },
      data: { displayCurrency: dto.displayCurrency, ...(dto.diasporaMode !== undefined ? { diasporaMode: dto.diasporaMode } : {}) },
      select: { displayCurrency: true, diasporaMode: true },
    });
  }

  /** Convertit un montant XAF entier vers la devise cible avec les taux stockés + fallback. */
  async convert(accountId: string, amountXaf: number, to: CurrencyEnum): Promise<{ amount: number; rate: number }> {
    if (to === 'XAF') return { amount: amountXaf, rate: 1 };
    const stored = await this.prisma.exchangeRate.findUnique({
      where: { accountId_base_quote: { accountId, base: 'XAF', quote: to } },
    });
    const rate = stored?.rate ?? DEFAULT_RATES[`XAF-${to}`] ?? 1;
    return { amount: Math.round(amountXaf * rate * 100) / 100, rate };
  }
}
