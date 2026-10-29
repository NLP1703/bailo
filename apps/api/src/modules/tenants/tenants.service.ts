import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateGuarantorDto,
  CreateTenantDto,
  ListTenantsQuery,
  TenantDeletionCheck,
  TenantDeletionMode,
  UpdateGuarantorDto,
  UpdateTenantDto,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppException } from '../../common/http/app.exception';
import { requireContext } from '../../common/tenancy/request-context';

const MONTHS_FR = [
  'janv.', 'févr.', 'mars', 'avril', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

type TenantColor = 'GREEN' | 'ORANGE' | 'RED' | 'GREY' | 'BLUE';
type TenantStatus = 'ACTIVE' | 'NOTICE' | 'CLOSED' | 'ARCHIVED';

interface EnrichedTenant {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  occupation: string | null;
  photoKey: string | null;
  status: TenantStatus;
  color: TenantColor;
  siteName: string | null;
  unitCode: string | null;
  totalPaid: number;
  remaining: number;
  monthsCoveredLabel: string | null; // "jusqu'à mars 2027" ou "2 mois d'avance"
  advanceMonths: number; // nb de mois futurs entièrement couverts
  nextDueDate: string | null;
  nextDueAmount: number | null;
  depositExpected: number;
  depositPaid: number;
  activeOccupancyId: string | null;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({ data: { ...dto, accountId: requireContext().accountId } });
  }

  /**
   * Liste enrichie : pour chaque locataire, l'occupation la plus récente + agrégats
   * financiers (total payé, mois couverts, prochaine échéance, caution).
   * Filtres : site, statut fonctionnel (actif, en préavis, en retard, en avance…).
   */
  async list(query: ListTenantsQuery): Promise<EnrichedTenant[]> {
    const q = query.q?.trim();
    const tenants = await this.prisma.tenant.findMany({
      where: {
        archived: query.archived ?? false,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
                { whatsapp: { contains: q } },
                // Recherche par code de chambre (« C12 ») sur l'occupation en cours.
                {
                  occupancies: {
                    some: {
                      status: { in: ['ACTIVE', 'NOTICE'] },
                      unit: { code: { contains: q, mode: 'insensitive' } },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        occupancies: {
          orderBy: { startDate: 'desc' },
          include: {
            unit: { select: { code: true, siteId: true, site: { select: { name: true, graceDays: true } } } },
            charges: {
              where: { status: { not: 'CANCELLED' } },
              orderBy: { dueDate: 'asc' },
              include: {
                allocations: {
                  where: { payment: { status: 'VALID' } },
                  select: { amount: true },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const today = new Date();
    const enriched = tenants
      .map((t) => this.enrichOne(t, today))
      .filter((e): e is EnrichedTenant => e !== null);

    const filtered = enriched.filter((e) => {
      if (query.siteId && e.activeOccupancyId) {
        // On filtre par site uniquement si on a une occupation active rattachée.
        return tenants.find((t) => t.id === e.id)?.occupancies[0]?.unit.siteId === query.siteId;
      }
      switch (query.status) {
        case 'active':   return e.status === 'ACTIVE';
        case 'notice':   return e.status === 'NOTICE';
        case 'closed':   return e.status === 'CLOSED';
        case 'overdue':  return e.color === 'RED';
        case 'upcoming': return e.color === 'ORANGE';
        case 'advance':  return e.advanceMonths > 0;
        default:         return true;
      }
    });

    return filtered;
  }

  /** Agrégats financiers par locataire — calculés sans RG importée (indépendant). */
  private enrichOne(
    t: {
      id: string; name: string; phone: string | null; whatsapp: string | null;
      occupation: string | null; photoKey: string | null;
      occupancies: Array<{
        id: string; status: 'ACTIVE' | 'NOTICE' | 'CLOSED';
        unit: { code: string; site: { name: string; graceDays: number } };
        charges: Array<{
          id: string; type: string; amount: number;
          periodYear: number | null; periodMonth: number | null;
          dueDate: Date; status: string;
          allocations: Array<{ amount: number }>;
        }>;
      }>;
    },
    today: Date,
  ): EnrichedTenant | null {
    const occ = t.occupancies[0];
    // Un tenant sans aucune occupation (jamais hébergé) → on l'affiche comme "archive" latent.
    if (!occ) {
      return {
        id: t.id, name: t.name, phone: t.phone, whatsapp: t.whatsapp,
        occupation: t.occupation, photoKey: t.photoKey,
        status: 'ARCHIVED', color: 'GREY',
        siteName: null, unitCode: null,
        totalPaid: 0, remaining: 0, monthsCoveredLabel: null, advanceMonths: 0,
        nextDueDate: null, nextDueAmount: null,
        depositExpected: 0, depositPaid: 0, activeOccupancyId: null,
      };
    }

    const status: TenantStatus =
      occ.status === 'ACTIVE' ? 'ACTIVE'
      : occ.status === 'NOTICE' ? 'NOTICE'
      : 'CLOSED';
    const graceDays = occ.unit.site.graceDays;

    let totalPaid = 0;
    let remaining = 0;
    let hasOverdue = false;
    let hasDueSoon = false;
    let nextDueDate: Date | null = null;
    let nextDueAmount = 0;
    let depositExpected = 0;
    let depositPaid = 0;
    // Mois loyer entièrement couverts (pour calcul "jusqu'à mars 2027")
    let lastFullyPaidRent: { year: number; month: number } | null = null;
    let advanceMonths = 0;

    for (const c of occ.charges) {
      const paid = c.allocations.reduce((s, a) => s + a.amount, 0);
      totalPaid += paid;
      const rest = c.amount - paid;

      if (c.type === 'CAUTION') {
        depositExpected += c.amount;
        depositPaid += Math.min(paid, c.amount);
      }

      if (rest > 0) {
        remaining += rest;
        if (!nextDueDate || c.dueDate < nextDueDate) {
          nextDueDate = c.dueDate;
          nextDueAmount = rest;
        }
        const graceCutoff = new Date(c.dueDate.getTime() + graceDays * 86_400_000);
        if (today > graceCutoff) hasOverdue = true;
        else {
          const diffDays = Math.ceil((c.dueDate.getTime() - today.getTime()) / 86_400_000);
          if (diffDays >= 0 && diffDays <= 3) hasDueSoon = true;
        }
      } else if (c.type === 'LOYER' && c.periodYear && c.periodMonth) {
        // Loyer entièrement payé → noter le dernier mois couvert
        if (
          !lastFullyPaidRent ||
          c.periodYear > lastFullyPaidRent.year ||
          (c.periodYear === lastFullyPaidRent.year && c.periodMonth > lastFullyPaidRent.month)
        ) {
          lastFullyPaidRent = { year: c.periodYear, month: c.periodMonth };
        }
        // Compte les mois futurs entièrement couverts (avance au-delà du mois courant)
        const cur = new Date();
        const isFuture =
          c.periodYear > cur.getFullYear() ||
          (c.periodYear === cur.getFullYear() && c.periodMonth > cur.getMonth() + 1);
        if (isFuture) advanceMonths += 1;
      }
    }

    const color: TenantColor =
      status === 'CLOSED' ? 'GREY'
      : hasOverdue ? 'RED'
      : hasDueSoon ? 'ORANGE'
      : 'GREEN';

    const monthsCoveredLabel = lastFullyPaidRent
      ? advanceMonths > 0
        ? `${advanceMonths} mois d'avance (jusqu'à ${MONTHS_FR[lastFullyPaidRent.month - 1]} ${lastFullyPaidRent.year})`
        : `à jour (${MONTHS_FR[lastFullyPaidRent.month - 1]} ${lastFullyPaidRent.year})`
      : null;

    return {
      id: t.id, name: t.name, phone: t.phone, whatsapp: t.whatsapp,
      occupation: t.occupation, photoKey: t.photoKey,
      status, color,
      siteName: occ.unit.site.name,
      unitCode: occ.unit.code,
      totalPaid,
      remaining,
      monthsCoveredLabel,
      advanceMonths,
      nextDueDate: nextDueDate ? nextDueDate.toISOString() : null,
      nextDueAmount: nextDueDate ? nextDueAmount : null,
      depositExpected,
      depositPaid,
      activeOccupancyId: status !== 'CLOSED' ? occ.id : null,
    };
  }

  async get(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        guarantors: { orderBy: { createdAt: 'asc' } },
        occupancies: {
          orderBy: { startDate: 'desc' },
          include: {
            unit: { select: { code: true, site: { select: { name: true, graceDays: true } } } },
            charges: {
              where: { status: { not: 'CANCELLED' } },
              orderBy: { dueDate: 'asc' },
              include: {
                allocations: {
                  where: { payment: { status: 'VALID' } },
                  include: {
                    payment: {
                      select: {
                        id: true, receiptNumber: true, mode: true, paidAt: true,
                        reference: true, amount: true,
                      },
                    },
                  },
                },
              },
            },
            payments: {
              where: { status: 'VALID' },
              orderBy: { paidAt: 'desc' },
              select: {
                id: true, receiptNumber: true, mode: true, paidAt: true,
                amount: true, reference: true,
              },
            },
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Locataire introuvable');

    // Construit la timeline agrégée : charges enrichies + totaux
    const timeline = tenant.occupancies.map((occ) => {
      let totalCharged = 0, totalPaid = 0, totalRemaining = 0;
      let depositExpected = 0, depositPaid = 0;
      const charges = occ.charges.map((c) => {
        const paid = c.allocations.reduce((s, a) => s + a.amount, 0);
        const rest = c.amount - paid;
        totalCharged += c.amount;
        totalPaid += paid;
        totalRemaining += rest;
        if (c.type === 'CAUTION') {
          depositExpected += c.amount;
          depositPaid += Math.min(paid, c.amount);
        }
        const periodLabel =
          c.type === 'LOYER' && c.periodMonth && c.periodYear
            ? `${MONTHS_FR[c.periodMonth - 1]} ${c.periodYear}`
            : null;
        return {
          id: c.id, type: c.type, amount: c.amount, paid, remaining: rest,
          dueDate: c.dueDate.toISOString(), status: c.status,
          periodLabel,
          payments: c.allocations.map((a) => ({
            paymentId: a.payment.id,
            receiptNumber: a.payment.receiptNumber,
            mode: a.payment.mode,
            paidAt: a.payment.paidAt.toISOString(),
            allocated: a.amount,
          })),
        };
      });
      return {
        occupancyId: occ.id, status: occ.status,
        unitCode: occ.unit.code, siteName: occ.unit.site.name,
        startDate: occ.startDate.toISOString(),
        actualEndDate: occ.actualEndDate ? occ.actualEndDate.toISOString() : null,
        totalCharged, totalPaid, totalRemaining,
        depositExpected, depositPaid,
        charges,
        payments: occ.payments.map((p) => ({
          ...p, paidAt: p.paidAt.toISOString(),
        })),
      };
    });

    return { tenant, timeline };
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.get(id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  /**
   * Pré-contrôle de suppression. Règles :
   * - aucun paiement (valide OU annulé) → suppression définitive. Un paiement annulé
   *   compte aussi : son numéro de reçu doit rester dans la séquence continue (RG9) ;
   * - des paiements + une occupation en cours (ACTIVE/NOTICE) → bloqué, il faut
   *   d'abord enregistrer la sortie (clôture, caution, solde) ;
   * - des paiements + tout est clôturé → archivage (masqué des listes, restaurable).
   */
  async deletionCheck(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<TenantDeletionCheck> {
    const tenant = await tx.tenant.findUnique({
      where: { id },
      select: {
        archived: true,
        _count: { select: { guarantors: true } },
        occupancies: { select: { id: true, status: true } },
      },
    });
    if (!tenant) throw AppException.notFound('TENANT_NOT_FOUND');

    const occupancyIds = tenant.occupancies.map((o) => o.id);
    const [payments, charges] = occupancyIds.length
      ? await Promise.all([
          tx.payment.count({ where: { occupancyId: { in: occupancyIds } } }),
          tx.charge.count({ where: { occupancyId: { in: occupancyIds } } }),
        ])
      : [0, 0];
    const activeOccupancies = tenant.occupancies.filter((o) => o.status !== 'CLOSED').length;

    const mode: TenantDeletionMode =
      payments === 0 ? 'delete' : activeOccupancies > 0 ? 'blocked' : 'archive';

    return {
      mode,
      archived: tenant.archived,
      counts: {
        occupancies: occupancyIds.length,
        activeOccupancies,
        payments,
        charges,
        guarantors: tenant._count.guarantors,
      },
    };
  }

  /**
   * Supprime (ou archive, selon `deletionCheck`) un locataire. Tout se fait dans une
   * transaction : le contrôle est rejoué à l'intérieur pour éviter qu'un paiement
   * saisi entre-temps (ex. synchro hors-ligne) ne soit emporté.
   */
  async remove(id: string): Promise<{ mode: 'deleted' | 'archived' }> {
    const ctx = requireContext();
    return this.prisma.$transaction(async (tx) => {
      const check = await this.deletionCheck(id, tx);
      if (check.mode === 'blocked') {
        throw AppException.conflict('TENANT_HAS_ACTIVE_OCCUPANCY', check.counts);
      }

      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id },
        select: { name: true, phone: true },
      });

      if (check.mode === 'archive') {
        await tx.tenant.update({ where: { id }, data: { archived: true } });
        await this.audit.log(tx, {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          entity: 'tenant',
          entityId: id,
          action: 'UPDATE',
          before: { archived: check.archived },
          after: { archived: true },
          reason: 'Archivage (historique de paiements conservé)',
        });
        return { mode: 'archived' as const };
      }

      // Suppression définitive — ordre imposé par les clés étrangères :
      // relances → affectations → échéances → occupations → locataire (garants en cascade).
      const occupancyIds = (
        await tx.occupancy.findMany({ where: { tenantId: id }, select: { id: true } })
      ).map((o) => o.id);
      const chargeIds = occupancyIds.length
        ? (
            await tx.charge.findMany({
              where: { occupancyId: { in: occupancyIds } },
              select: { id: true },
            })
          ).map((c) => c.id)
        : [];
      const guarantorIds = (
        await tx.guarantor.findMany({ where: { tenantId: id }, select: { id: true } })
      ).map((g) => g.id);
      if (occupancyIds.length) {
        const chargeWhere = { occupancyId: { in: occupancyIds } };
        await tx.reminder.deleteMany({ where: { charge: chargeWhere } });
        await tx.allocation.deleteMany({ where: { charge: chargeWhere } });
        await tx.charge.deleteMany({ where: chargeWhere });
        await tx.occupancy.deleteMany({ where: { id: { in: occupancyIds } } });
      }
      await tx.tenant.delete({ where: { id } });

      // Suppressions à répercuter sur les téléphones (réception mobile, § 7).
      const gone: Array<[string, string[]]> = [
        ['tenants', [id]],
        ['guarantors', guarantorIds],
        ['occupancies', occupancyIds],
        ['charges', chargeIds],
      ];
      await tx.syncTombstone.createMany({
        data: gone.flatMap(([tableName, ids]) =>
          ids.map((entityId) => ({ accountId: ctx.accountId, tableName, entityId })),
        ),
      });

      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'tenant',
        entityId: id,
        // L'énumération AuditAction n'a pas (encore) de DELETE : VOID + motif explicite.
        action: 'VOID',
        before: { name: tenant.name, phone: tenant.phone, ...check.counts },
        reason: 'Suppression définitive du locataire (aucun paiement enregistré)',
      });
      return { mode: 'deleted' as const };
    });
  }

  /** Restaure un locataire archivé (il réapparaît dans les listes). */
  async restore(id: string) {
    const ctx = requireContext();
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id }, select: { archived: true } });
      if (!tenant) throw AppException.notFound('TENANT_NOT_FOUND');
      if (!tenant.archived) return { archived: false };
      await tx.tenant.update({ where: { id }, data: { archived: false } });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'tenant',
        entityId: id,
        action: 'UPDATE',
        before: { archived: true },
        after: { archived: false },
        reason: 'Restauration',
      });
      return { archived: false };
    });
  }

  async addGuarantor(tenantId: string, dto: CreateGuarantorDto) {
    await this.get(tenantId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimaryPayer) {
        await tx.guarantor.updateMany({
          where: { tenantId, isPrimaryPayer: true },
          data: { isPrimaryPayer: false },
        });
      }
      return tx.guarantor.create({
        data: { tenantId, accountId: requireContext().accountId, ...dto },
      });
    });
  }

  async updateGuarantor(id: string, dto: UpdateGuarantorDto) {
    const guarantor = await this.prisma.guarantor.findUnique({ where: { id } });
    if (!guarantor) throw new NotFoundException('Garant introuvable');
    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimaryPayer) {
        await tx.guarantor.updateMany({
          where: { tenantId: guarantor.tenantId, isPrimaryPayer: true, id: { not: id } },
          data: { isPrimaryPayer: false },
        });
      }
      return tx.guarantor.update({ where: { id }, data: dto });
    });
  }
}
