import { ForbiddenException, HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SYNC_ERRORS,
  SYNC_OPERATION_TYPES,
  SYNC_PAYLOAD_SCHEMAS,
  type LegacySyncPushDto,
  type MobileSyncPushDto,
  type SyncOpResult,
  type SyncOperationDto,
  type SyncOperationType,
  type SyncPullPage,
  type SyncPullQuery,
  type SyncPushDto,
  type UserRole,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../../common/billing/billing.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import type { RequestContext } from '../../common/tenancy/request-context';
import { toDate } from '../../common/time/to-date';
import { PaymentsService } from '../payments/payments.service';
import { MetersService } from '../meters/meters.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { ExpensesService } from '../expenses/expenses.service';
import { CashService } from '../cash/cash.service';
import { DevicesService } from '../devices/devices.service';

export interface LegacySyncPushResult {
  clientId: string;
  status: 'ok' | 'error';
  paymentId?: string;
  idempotentReplay?: boolean;
  error?: string;
}

/** Rôles autorisés par type d'opération : les mêmes que les routes REST équivalentes. */
const ALLOWED_ROLES: Record<SyncOperationType, readonly UserRole[]> = {
  'payment.create': ['OWNER', 'MANAGER', 'CARETAKER'],
  'meterReading.create': ['OWNER', 'MANAGER', 'CARETAKER'],
  'ticket.create': ['OWNER', 'MANAGER', 'CARETAKER'],
  'expense.create': ['OWNER', 'MANAGER'],
  'cashHandover.create': ['OWNER', 'MANAGER', 'CARETAKER'],
};

/** Opération restée « en cours » plus longtemps : on ne sait plus si elle a été appliquée (§ 5). */
const STALE_PROCESSING_MS = 2 * 60 * 1000;
/** Marge du curseur : une écriture validée pendant la lecture n'est pas perdue (§ 7). */
const CURSOR_MARGIN_MS = 2 * 60 * 1000;
/** Bornes des dates saisies sur le téléphone (§ 9). */
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_PAST_DAYS = 7;

const DAY = 86_400_000;

/** Tables envoyées au téléphone, dans l'ordre de dépendance. */
const PULL_TABLES = [
  'sites',
  'blocks',
  'units',
  'tenants',
  'guarantors',
  'occupancies',
  'charges',
  'payments',
  'meters',
  'meter_readings',
  'tickets',
  'expenses',
  'cash_handovers',
] as const;
type PullTable = (typeof PULL_TABLES)[number];

interface PullCursor {
  /** Borne basse : changements strictement après (null = tout). */
  s: string | null;
  /** Borne haute fixée au début de la réception (instantané cohérent entre les pages). */
  u: string;
  /** Position par table, pour les tables pas encore terminées : [horodatage, id]. */
  k: Partial<Record<PullTable, [string, string]>>;
  /** Tables terminées dans cet instantané. */
  d: PullTable[];
}

type Row = { id: string; updatedAt?: Date; createdAt?: Date };

class OpRejected extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly access: SiteAccessService,
    private readonly payments: PaymentsService,
    private readonly meters: MetersService,
    private readonly maintenance: MaintenanceService,
    private readonly expenses: ExpensesService,
    private readonly cash: CashService,
    private readonly devices: DevicesService,
  ) {}

  // ─── Envoi ───────────────────────────────────────────────────────────────

  push(ctx: RequestContext, dto: SyncPushDto) {
    return 'ops' in dto ? this.pushMobile(ctx, dto) : this.pushLegacy(ctx, dto);
  }

  /** Ancien format (site web) : paiements idempotents sur leur `clientId`. */
  private async pushLegacy(
    ctx: RequestContext,
    dto: LegacySyncPushDto,
  ): Promise<{ results: LegacySyncPushResult[] }> {
    const results: LegacySyncPushResult[] = [];
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
   * Protocole mobile (§ 5) : opérations traitées dans l'ordre de `seq`, une transaction
   * chacune, tracées dans `sync_operation` pour ne jamais être appliquées deux fois.
   * Sur une erreur passagère, on s'arrête : la suite repartira dans l'ordre.
   */
  private async pushMobile(
    ctx: RequestContext,
    dto: MobileSyncPushDto,
  ): Promise<{ results: SyncOpResult[]; deviceRevoked: boolean }> {
    const device = await this.devices.touch(ctx, dto.deviceId, {
      pendingCount: dto.pendingCount,
      oldestPendingAt: dto.oldestPendingAt,
    });
    const readOnly = await this.billing.isReadOnly(ctx.accountId);
    const ops = [...dto.ops].sort((a, b) => a.seq - b.seq);
    const results: SyncOpResult[] = [];

    for (const op of ops) {
      const result = await this.processOne(ctx, op, {
        deviceKey: dto.deviceId,
        readOnly,
        revokedAt: device.revokedAt,
      });
      results.push(result);
      if (result.status === 'retry') break;
    }
    return { results, deviceRevoked: device.revokedAt !== null };
  }

  private async processOne(
    ctx: RequestContext,
    op: SyncOperationDto,
    env: { deviceKey: string; readOnly: boolean; revokedAt: Date | null },
  ): Promise<SyncOpResult> {
    const existing = await this.prisma.syncOperation.findFirst({
      where: { opId: op.opId, accountId: ctx.accountId },
    });
    if (existing) return this.replay(existing);

    try {
      await this.prisma.syncOperation.create({
        data: {
          opId: op.opId,
          accountId: ctx.accountId,
          userId: ctx.userId,
          deviceKey: env.deviceKey,
          type: op.type,
          v: op.v,
          siteId: op.siteId,
          seq: op.seq,
          status: 'PROCESSING',
          clientCreatedAt: new Date(op.createdAt),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await this.prisma.syncOperation.findFirst({
          where: { opId: op.opId, accountId: ctx.accountId },
        });
        if (again) return this.replay(again);
        return {
          opId: op.opId,
          status: 'rejected',
          errorCode: SYNC_ERRORS.OP_ID_CONFLICT,
          message: 'Identifiant d’opération déjà utilisé',
        };
      }
      return { opId: op.opId, status: 'retry', message: 'Enregistrement impossible' };
    }

    try {
      const { entityId, entity } = await this.apply(ctx, op, env);
      await this.prisma.syncOperation.update({
        where: { opId: op.opId },
        data: { status: 'APPLIED', entityId },
      });
      return { opId: op.opId, status: 'applied', entityId, entity };
    } catch (error) {
      const rejection = toRejection(error);
      if (rejection) {
        await this.prisma.syncOperation.update({
          where: { opId: op.opId },
          data: { status: 'REJECTED', errorCode: rejection.errorCode, message: rejection.message },
        });
        return { opId: op.opId, status: 'rejected', ...rejection };
      }
      // Erreur passagère : les services appliquent dans une transaction, rien n'est resté.
      this.logger.warn(`Opération ${op.type} remise à plus tard : ${(error as Error).message}`);
      await this.prisma.syncOperation.delete({ where: { opId: op.opId } }).catch(() => undefined);
      return { opId: op.opId, status: 'retry', message: 'Erreur passagère du serveur' };
    }
  }

  /** Renvoi d'une opération déjà connue : même réponse, rien n'est réappliqué (RGM1). */
  private async replay(row: {
    opId: string;
    status: string;
    entityId: string | null;
    errorCode: string | null;
    message: string | null;
    updatedAt: Date;
  }): Promise<SyncOpResult> {
    if (row.status === 'APPLIED') {
      return {
        opId: row.opId,
        status: 'duplicate',
        ...(row.entityId ? { entityId: row.entityId } : {}),
      };
    }
    if (row.status === 'REJECTED') {
      return {
        opId: row.opId,
        status: 'rejected',
        errorCode: row.errorCode ?? SYNC_ERRORS.BUSINESS_RULE,
        message: row.message ?? 'Opération refusée',
      };
    }
    if (Date.now() - row.updatedAt.getTime() < STALE_PROCESSING_MS) {
      return { opId: row.opId, status: 'retry', message: 'Opération en cours de traitement' };
    }
    // Interrompue sans trace de fin : on ne devine pas, on la montre « à corriger » (RGM6).
    const message =
      'Traitement interrompu côté serveur : vérifiez si elle a été enregistrée avant de la refaire.';
    await this.prisma.syncOperation.update({
      where: { opId: row.opId },
      data: { status: 'REJECTED', errorCode: SYNC_ERRORS.NEEDS_REVIEW, message },
    });
    return { opId: row.opId, status: 'rejected', errorCode: SYNC_ERRORS.NEEDS_REVIEW, message };
  }

  private async apply(
    ctx: RequestContext,
    op: SyncOperationDto,
    env: { readOnly: boolean; revokedAt: Date | null },
  ): Promise<{ entityId: string; entity: unknown }> {
    if (!(SYNC_OPERATION_TYPES as readonly string[]).includes(op.type) || op.v !== 1) {
      throw new OpRejected(
        SYNC_ERRORS.UNSUPPORTED_OPERATION,
        `Opération « ${op.type} » (v${op.v}) non prise en charge par le serveur : mettez à jour l’application.`,
      );
    }
    const type = op.type as SyncOperationType;
    if (env.revokedAt && new Date(op.createdAt) >= env.revokedAt) {
      throw new OpRejected(
        SYNC_ERRORS.DEVICE_REVOKED,
        'Saisie faite après la déconnexion de ce téléphone.',
      );
    }
    if (env.readOnly) {
      throw new OpRejected(
        SYNC_ERRORS.READ_ONLY,
        'Compte en lecture seule : abonnement à régulariser.',
      );
    }
    if (!ALLOWED_ROLES[type].includes(ctx.role)) {
      throw new OpRejected(SYNC_ERRORS.FORBIDDEN, 'Votre rôle ne permet pas cette action.');
    }
    try {
      await this.access.assertSiteAccess(ctx, op.siteId);
    } catch {
      throw new OpRejected(SYNC_ERRORS.SITE_FORBIDDEN, 'Vous n’avez plus accès à ce site.');
    }
    const parsed = SYNC_PAYLOAD_SCHEMAS[type].safeParse(op.payload);
    if (!parsed.success) {
      throw new OpRejected(
        SYNC_ERRORS.INVALID_PAYLOAD,
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' ; '),
      );
    }

    switch (type) {
      case 'payment.create': {
        const payload = parsed.data as (typeof SYNC_PAYLOAD_SCHEMAS)['payment.create']['_output'];
        assertDateInWindow(payload.paidAt);
        const occupancy = await this.prisma.occupancy.findFirst({
          where: { id: payload.occupancyId, accountId: ctx.accountId },
          select: { unit: { select: { siteId: true } } },
        });
        if (!occupancy) throw new OpRejected(SYNC_ERRORS.NOT_FOUND, 'Occupation introuvable.');
        assertSameSite(occupancy.unit.siteId, op.siteId);
        const res = await this.payments.record(ctx, { ...payload, clientId: op.opId });
        return {
          entityId: res.payment.id,
          entity: { ...res.payment, allocations: res.allocations },
        };
      }
      case 'meterReading.create': {
        const payload =
          parsed.data as (typeof SYNC_PAYLOAD_SCHEMAS)['meterReading.create']['_output'];
        assertDateInWindow(payload.readAt);
        const meter = await this.prisma.meter.findFirst({
          where: { id: payload.meterId, accountId: ctx.accountId },
          select: { unit: { select: { siteId: true } } },
        });
        if (!meter) throw new OpRejected(SYNC_ERRORS.NOT_FOUND, 'Compteur introuvable.');
        assertSameSite(meter.unit.siteId, op.siteId);
        const reading = await this.meters.recordReading(ctx, payload);
        return { entityId: reading.id, entity: reading };
      }
      case 'ticket.create': {
        const payload = parsed.data as (typeof SYNC_PAYLOAD_SCHEMAS)['ticket.create']['_output'];
        if (payload.unitId) {
          const unit = await this.prisma.unit.findFirst({
            where: { id: payload.unitId, accountId: ctx.accountId },
            select: { siteId: true },
          });
          if (!unit) throw new OpRejected(SYNC_ERRORS.NOT_FOUND, 'Chambre introuvable.');
          assertSameSite(unit.siteId, op.siteId);
        }
        const ticket = await this.maintenance.create(ctx, { ...payload, siteId: op.siteId });
        return { entityId: ticket.id, entity: ticket };
      }
      case 'expense.create': {
        const payload = parsed.data as (typeof SYNC_PAYLOAD_SCHEMAS)['expense.create']['_output'];
        assertDateInWindow(payload.spentAt);
        const expense = await this.expenses.create(ctx, { ...payload, siteId: op.siteId });
        return { entityId: expense.id, entity: expense };
      }
      case 'cashHandover.create': {
        const payload =
          parsed.data as (typeof SYNC_PAYLOAD_SCHEMAS)['cashHandover.create']['_output'];
        const handover = (await this.cash.createHandover(ctx, payload)) as { id: string };
        return { entityId: handover.id, entity: handover };
      }
    }
  }

  // ─── Réception ───────────────────────────────────────────────────────────

  pull(ctx: RequestContext, query: SyncPullQuery, deviceKey?: string) {
    return query.siteId
      ? this.pullSite(ctx, query.siteId, query.cursor ?? null, query.limit, deviceKey)
      : this.pullLegacy(query);
  }

  /**
   * Ancien instantané du compte (site web) : entités modifiées depuis `since`.
   * Le cloisonnement par compte est appliqué automatiquement (NF7).
   */
  private async pullLegacy(query: SyncPullQuery) {
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

  /**
   * Protocole mobile (§ 7) : changements d'un site depuis le curseur, page par page.
   * Chaque table est parcourue par (horodatage, id) jusqu'à une borne haute fixée au
   * début de la réception ; le curseur final repart de cette borne moins une marge.
   */
  private async pullSite(
    ctx: RequestContext,
    siteId: string,
    rawCursor: string | null,
    limit: number,
    deviceKey?: string,
  ): Promise<SyncPullPage> {
    if (deviceKey) {
      const device = await this.devices.touch(ctx, deviceKey);
      if (device.revokedAt) {
        throw new ForbiddenException({
          code: SYNC_ERRORS.DEVICE_REVOKED,
          message: 'Ce téléphone a été déconnecté par le propriétaire.',
        });
      }
    }
    await this.access.assertSiteAccess(ctx, siteId);

    const cursor = decodeCursor(rawCursor) ?? {
      s: null,
      u: new Date().toISOString(),
      k: {},
      d: [],
    };
    const since = cursor.s ? new Date(cursor.s) : null;
    const upper = new Date(cursor.u);

    // Remise à zéro du compte depuis le dernier passage : le téléphone recharge tout.
    if (since) {
      const reset = await this.prisma.syncTombstone.findFirst({
        where: { accountId: ctx.accountId, tableName: '*', deletedAt: { gt: since } },
      });
      if (reset) {
        return { changes: {}, tombstones: {}, cursor: '', hasMore: false, resetRequired: true };
      }
    }

    const changes: Record<string, unknown[]> = {};
    const next: PullCursor = { ...cursor, k: { ...cursor.k }, d: [...cursor.d] };
    let hasMore = false;

    for (const table of PULL_TABLES) {
      if (cursor.d.includes(table)) continue;
      const rows = await this.readTable(ctx, siteId, table, since, upper, cursor.k[table], limit);
      if (rows.length > 0) changes[table] = rows;
      if (rows.length === limit) {
        const last = rows[rows.length - 1]!;
        next.k[table] = [stampOf(table, last).toISOString(), last.id];
        hasMore = true;
      } else {
        delete next.k[table];
        next.d.push(table);
      }
    }

    const tombstones: Record<string, string[]> = {};
    if (since && !hasMore) {
      const gone = await this.prisma.syncTombstone.findMany({
        where: {
          accountId: ctx.accountId,
          deletedAt: { gt: since, lte: upper },
          NOT: { tableName: '*' },
        },
        select: { tableName: true, entityId: true },
      });
      for (const g of gone) (tombstones[g.tableName] ??= []).push(g.entityId);
    }

    const finalCursor: PullCursor = {
      s: new Date(upper.getTime() - CURSOR_MARGIN_MS).toISOString(),
      u: '',
      k: {},
      d: [],
    };
    return {
      changes,
      tombstones,
      cursor: encodeCursor(hasMore ? next : finalCursor),
      hasMore,
    };
  }

  private async readTable(
    ctx: RequestContext,
    siteId: string,
    table: PullTable,
    since: Date | null,
    upper: Date,
    after: [string, string] | undefined,
    take: number,
  ): Promise<Row[]> {
    const now = Date.now();
    const accountId = ctx.accountId;
    const stamp = table === 'meter_readings' ? 'createdAt' : 'updatedAt';
    const window: Prisma.DateTimeFilter = { lte: upper, ...(since ? { gt: since } : {}) };
    // Position dans `AND` : plusieurs tables ajoutent leur propre `OR` (statut ouvert…),
    // qui écraserait sinon celui du curseur et ferait relire la même page.
    const keyset = after
      ? {
          AND: [
            {
              OR: [
                { [stamp]: { gt: new Date(after[0]) } },
                { [stamp]: new Date(after[0]), id: { gt: after[1] } },
              ],
            },
          ],
        }
      : {};
    const base = { [stamp]: window, ...keyset };
    const orderBy = [{ [stamp]: 'asc' as const }, { id: 'asc' as const }];
    const inSite = { unit: { siteId } };
    const recent = new Date(now - 90 * DAY);

    switch (table) {
      case 'sites':
        return this.prisma.site.findMany({
          where: { ...base, id: siteId, accountId },
          orderBy,
          take,
        });
      case 'blocks':
        return this.prisma.block.findMany({ where: { ...base, siteId, accountId }, orderBy, take });
      case 'units':
        return this.prisma.unit.findMany({ where: { ...base, siteId, accountId }, orderBy, take });
      case 'tenants':
        return this.prisma.tenant.findMany({
          where: {
            ...base,
            accountId,
            occupancies: { some: { ...inSite, ...openOrRecent(recent) } },
          },
          orderBy,
          take,
        });
      case 'guarantors':
        return this.prisma.guarantor.findMany({
          where: {
            ...base,
            accountId,
            tenant: { occupancies: { some: { ...inSite, ...openOrRecent(recent) } } },
          },
          orderBy,
          take,
        });
      case 'occupancies':
        return this.prisma.occupancy.findMany({
          where: { ...base, accountId, ...inSite, ...openOrRecent(recent) },
          orderBy,
          take,
        });
      case 'charges': {
        // Chaque échéance porte ce qui est déjà payé dessus (paiements valides) : le
        // téléphone en déduit le reste dû, le statut (RG7, RG10) et l'affectation (RG5).
        const rows = await this.prisma.charge.findMany({
          where: {
            ...base,
            accountId,
            occupancy: inSite,
            OR: [{ status: { notIn: ['PAID', 'CANCELLED'] } }, { dueDate: { gte: recent } }],
          },
          include: {
            allocations: { where: { payment: { status: 'VALID' } }, select: { amount: true } },
          },
          orderBy,
          take,
        });
        return rows.map(({ allocations, ...charge }) => ({
          ...charge,
          paid: allocations.reduce((sum, a) => sum + a.amount, 0),
        }));
      }
      case 'payments':
        return this.prisma.payment.findMany({
          where: { ...base, accountId, occupancy: inSite, paidAt: { gte: recent } },
          orderBy,
          take,
        });
      case 'meters':
        return this.prisma.meter.findMany({
          where: { ...base, accountId, ...inSite },
          orderBy,
          take,
        });
      case 'meter_readings':
        return this.prisma.meterReading.findMany({
          where: { ...base, accountId, meter: inSite, readAt: { gte: new Date(now - 120 * DAY) } },
          orderBy,
          take,
        });
      case 'tickets':
        return this.prisma.maintenanceTicket.findMany({
          where: {
            ...base,
            accountId,
            siteId,
            OR: [
              { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
              { updatedAt: { gte: new Date(now - 30 * DAY) } },
            ],
          },
          orderBy,
          take,
        });
      case 'cash_handovers':
        // Remises de l'utilisateur lui-même (écran « Ma caisse ») : elles ne dépendent pas
        // du site, seulement de l'encaisseur.
        return this.prisma.cashHandover.findMany({
          where: {
            ...base,
            accountId,
            collectorId: ctx.userId,
            createdAt: { gte: new Date(now - 120 * DAY) },
          },
          orderBy,
          take,
        });
      case 'expenses': {
        const start = new Date();
        start.setUTCDate(1);
        start.setUTCMonth(start.getUTCMonth() - 1);
        start.setUTCHours(0, 0, 0, 0);
        return this.prisma.expense.findMany({
          where: { ...base, accountId, siteId, spentAt: { gte: start } },
          orderBy,
          take,
        });
      }
    }
  }
}

function openOrRecent(recent: Date) {
  return {
    OR: [
      { status: { in: ['ACTIVE' as const, 'NOTICE' as const] } },
      { actualEndDate: { gte: recent } },
    ],
  };
}

function stampOf(table: PullTable, row: Row): Date {
  const value = table === 'meter_readings' ? row.createdAt : row.updatedAt;
  return value ?? new Date(0);
}

function encodeCursor(cursor: PullCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | null): PullCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as PullCursor;
    if (typeof parsed !== 'object' || parsed === null) return null;
    // Curseur final : la nouvelle borne haute est « maintenant ».
    if (!parsed.u) parsed.u = new Date().toISOString();
    if (parsed.s !== null && Number.isNaN(Date.parse(parsed.s))) return null;
    if (Number.isNaN(Date.parse(parsed.u))) return null;
    parsed.k ??= {};
    parsed.d = Array.isArray(parsed.d)
      ? parsed.d.filter((t) => (PULL_TABLES as readonly string[]).includes(t))
      : [];
    return parsed;
  } catch {
    return null;
  }
}

function assertSameSite(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new OpRejected(
      SYNC_ERRORS.SITE_MISMATCH,
      'Cet élément n’appartient pas au site de l’opération.',
    );
  }
}

/** Date saisie sur le téléphone : pas plus de 5 min dans le futur ni de 7 jours dans le passé (§ 9). */
function assertDateInWindow(value: string | undefined): void {
  if (!value) return;
  const now = Date.now();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = Date.parse(`${value}T00:00:00Z`);
    const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
    if (day > today + DAY || day < today - MAX_PAST_DAYS * DAY) throw dateOutOfRange();
    return;
  }
  const at = Date.parse(value);
  if (Number.isNaN(at) || at > now + MAX_FUTURE_MS || at < now - MAX_PAST_DAYS * DAY)
    throw dateOutOfRange();
}

function dateOutOfRange(): OpRejected {
  return new OpRejected(
    SYNC_ERRORS.DATE_OUT_OF_RANGE,
    'Date hors limites : vérifiez la date du téléphone et corrigez la saisie.',
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Les refus métier (4xx) vont « à corriger » ; le reste est passager. */
function toRejection(error: unknown): { errorCode: string; message: string } | null {
  if (error instanceof OpRejected) return { errorCode: error.errorCode, message: error.message };
  if (error instanceof HttpException && error.getStatus() >= 400 && error.getStatus() < 500) {
    const body = error.getResponse() as string | { code?: string; message?: string | string[] };
    const message =
      typeof body === 'string'
        ? body
        : Array.isArray(body.message)
          ? body.message.join(', ')
          : (body.message ?? error.message);
    const code = typeof body === 'object' && body.code ? body.code : SYNC_ERRORS.BUSINESS_RULE;
    return { errorCode: code, message };
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2003', 'P2025'].includes(error.code)
  ) {
    return { errorCode: SYNC_ERRORS.NOT_FOUND, message: 'Élément introuvable.' };
  }
  return null;
}
