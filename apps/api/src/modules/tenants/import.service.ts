import { Injectable, NotFoundException } from '@nestjs/common';
import {
  generateRentSchedule,
  rentCoveredAmount,
  type ImportRowResult,
  type ImportTenantRow,
  type ImportTenantsDto,
} from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import { toDate } from '../../common/time/to-date';
import type { RequestContext } from '../../common/tenancy/request-context';
import { OccupanciesService } from '../occupancies/occupancies.service';

/**
 * Mise en service rapide (P1) : crée locataires + occupations à partir de lignes
 * (le front a parsé l'Excel modèle). « payé jusqu'au mois de… » génère les échéances
 * et un paiement d'ouverture couvrant ces mois. Réutilise la logique testée du Lot 3.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SiteAccessService,
    private readonly occupancies: OccupanciesService,
  ) {}

  async importTenants(ctx: RequestContext, dto: ImportTenantsDto): Promise<ImportRowResult[]> {
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
    if (!site) throw new NotFoundException('Site introuvable');
    await this.access.assertSiteAccess(ctx, dto.siteId);

    const results: ImportRowResult[] = [];
    for (let i = 0; i < dto.rows.length; i += 1) {
      const row = dto.rows[i]!;
      try {
        results.push({ row: i + 1, status: 'ok', ...(await this.importRow(ctx, dto.siteId, row)) });
      } catch (error) {
        results.push({
          row: i + 1,
          status: 'error',
          error: error instanceof Error ? error.message : 'Échec',
        });
      }
    }
    return results;
  }

  private async importRow(ctx: RequestContext, siteId: string, row: ImportTenantRow) {
    const unit = await this.prisma.unit.findUnique({
      where: { siteId_code: { siteId, code: row.unitCode } },
    });
    if (!unit) throw new Error(`Chambre « ${row.unitCode} » introuvable sur ce site`);

    const tenant = await this.prisma.tenant.create({
      data: {
        accountId: ctx.accountId,
        name: row.name,
        phone: row.phone,
        whatsapp: row.whatsapp,
      },
    });

    const startDate = toDate(row.startDate);
    const dueDay = row.dueDay ?? Math.min(startDate.getUTCDate(), 28);

    // Montant du paiement d'ouverture = loyers jusqu'au mois « payé jusqu'à ».
    let advanceAmount: number | undefined;
    if (row.paidUntil) {
      const [y, m] = row.paidUntil.split('-').map(Number);
      const { charges } = generateRentSchedule({
        startDate,
        plannedEndDate: null,
        monthlyRent: row.monthlyRent,
        dueDay,
        prorataFirstMonth: false,
      });
      advanceAmount = rentCoveredAmount(charges, { year: y!, month: m! });
    }

    const created = await this.occupancies.create(ctx, {
      unitId: unit.id,
      tenantId: tenant.id,
      startDate: row.startDate,
      monthlyRent: row.monthlyRent,
      dueDay,
      deposit: row.deposit ?? 0,
      ...(advanceAmount ? { advance: { amount: advanceAmount } } : {}),
      paymentMode: 'AUTRE',
    });

    return { tenantId: tenant.id, occupancyId: created.occupancy.id };
  }
}
