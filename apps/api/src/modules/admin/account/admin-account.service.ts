import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminAccountView, UpdateAdminAccountDto } from '@bailo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../../common/audit/audit.service';
import type { RequestContext } from '../../../common/tenancy/request-context';

/**
 * Paramètres du compte (OWNER uniquement, @Roles au contrôleur).
 *
 * Chaque modification est tracée dans `audit_log` dans la même transaction
 * que l'écriture (`AuditService.log`) : jamais d'audit sans écriture, jamais
 * d'écriture sans audit (RG21). Le `before` et le `after` ne contiennent
 * aucune donnée personnelle sensible — on y met des réglages produit.
 */
@Injectable()
export class AdminAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(ctx: RequestContext): Promise<AdminAccountView> {
    const row = await this.prisma.account.findUnique({ where: { id: ctx.accountId } });
    if (!row) throw new NotFoundException('Compte introuvable');
    return toView(row);
  }

  async update(ctx: RequestContext, dto: UpdateAdminAccountDto): Promise<AdminAccountView> {
    // En production, l'URL de vérification des reçus DOIT être en HTTPS :
    // elle sert à construire le lien du QR imprimé sur chaque reçu.
    if (
      dto.verifyBaseUrl &&
      process.env.NODE_ENV === 'production' &&
      !dto.verifyBaseUrl.startsWith('https://')
    ) {
      throw new BadRequestException('L’URL de vérification doit utiliser HTTPS en production');
    }

    const existing = await this.prisma.account.findUnique({ where: { id: ctx.accountId } });
    if (!existing) throw new NotFoundException('Compte introuvable');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.logoKey !== undefined) data.logoKey = dto.logoKey;
    if (dto.receiptPrefix !== undefined) data.receiptPrefix = dto.receiptPrefix;
    if (dto.receiptFooter !== undefined) data.receiptFooter = dto.receiptFooter;
    if (dto.displayCurrency !== undefined) data.displayCurrency = dto.displayCurrency;
    if (dto.diasporaMode !== undefined) data.diasporaMode = dto.diasporaMode;
    if (dto.verifyBaseUrl !== undefined) data.verifyBaseUrl = dto.verifyBaseUrl;
    if (dto.defaults) {
      data.defaultPenaltyEnabled = dto.defaults.penaltyEnabled;
      data.defaultPenaltyMode = dto.defaults.penaltyMode;
      data.defaultPenaltyValue = dto.defaults.penaltyValue;
      data.defaultPenaltyGraceDays = dto.defaults.penaltyGraceDays;
      data.defaultProrataMode = dto.defaults.prorataMode;
    }

    const before = snapshot(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.account.update({ where: { id: ctx.accountId }, data });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'account',
        entityId: ctx.accountId,
        action: 'UPDATE',
        before,
        after: snapshot(row),
      });
      return row;
    });

    return toView(updated);
  }
}

type AccountRow = Awaited<ReturnType<PrismaService['account']['findUnique']>>;

/** Vue publique : regroupe les 5 défauts dans un sous-objet pour l'UI. */
function toView(a: NonNullable<AccountRow>): AdminAccountView {
  return {
    id: a.id,
    name: a.name,
    phone: a.phone,
    logoKey: a.logoKey,
    receiptPrefix: a.receiptPrefix,
    receiptFooter: a.receiptFooter,
    displayCurrency: a.displayCurrency,
    diasporaMode: a.diasporaMode,
    verifyBaseUrl: a.verifyBaseUrl,
    defaults: {
      penaltyEnabled: a.defaultPenaltyEnabled,
      penaltyMode: a.defaultPenaltyMode,
      penaltyValue: a.defaultPenaltyValue,
      penaltyGraceDays: a.defaultPenaltyGraceDays,
      prorataMode: a.defaultProrataMode,
    },
  };
}

/** Capture compacte pour `audit_log.before/after` — aucun champ sensible. */
function snapshot(a: NonNullable<AccountRow>): Record<string, unknown> {
  return {
    name: a.name,
    phone: a.phone,
    logoKey: a.logoKey,
    receiptPrefix: a.receiptPrefix,
    receiptFooter: a.receiptFooter,
    displayCurrency: a.displayCurrency,
    diasporaMode: a.diasporaMode,
    verifyBaseUrl: a.verifyBaseUrl,
    defaults: {
      penaltyEnabled: a.defaultPenaltyEnabled,
      penaltyMode: a.defaultPenaltyMode,
      penaltyValue: a.defaultPenaltyValue,
      penaltyGraceDays: a.defaultPenaltyGraceDays,
      prorataMode: a.defaultProrataMode,
    },
  };
}
