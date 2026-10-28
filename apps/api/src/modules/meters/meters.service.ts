import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Meter, MeterReading } from '@prisma/client';
import type {
  CreateMeterDto,
  ReadingsQuery,
  RecordReadingDto,
  UpdateMeterDto,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/tenancy/request-context';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import { toDate } from '../../common/time/to-date';

@Injectable()
export class MetersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: SiteAccessService,
  ) {}

  async create(ctx: RequestContext, dto: CreateMeterDto): Promise<Meter> {
    const unit = await this.prisma.unit.findUnique({ where: { id: dto.unitId }, select: { accountId: true } });
    if (!unit || unit.accountId !== ctx.accountId) throw new NotFoundException('Unité introuvable');
    try {
      return await this.prisma.meter.create({
        data: {
          accountId: ctx.accountId,
          unitId: dto.unitId,
          type: dto.type,
          identifier: dto.identifier,
          unitPrice: dto.unitPrice,
          unitLabel: dto.unitLabel ?? '',
          createdBy: ctx.userId,
        },
      });
    } catch (e: unknown) {
      if ((e as { code?: string } | null)?.code === 'P2002')
        throw new BadRequestException(`Un compteur ${dto.type} existe déjà pour cette unité`);
      throw e;
    }
  }

  async update(ctx: RequestContext, id: string, dto: UpdateMeterDto): Promise<Meter> {
    const m = await this.prisma.meter.findUnique({ where: { id } });
    if (!m || m.accountId !== ctx.accountId) throw new NotFoundException();
    return this.prisma.meter.update({ where: { id }, data: dto });
  }

  async listForUnit(ctx: RequestContext, unitId: string) {
    return this.prisma.meter.findMany({
      where: { accountId: ctx.accountId, unitId },
      include: { readings: { orderBy: { readAt: 'desc' }, take: 12 } },
    });
  }

  /**
   * Enregistre un relevé. Si demandé et qu'une occupation active existe sur l'unité,
   * crée automatiquement une charge EAU/ELECTRICITE pour refacturation au locataire
   * (prix unitaire × consommation).
   */
  async recordReading(ctx: RequestContext, dto: RecordReadingDto): Promise<MeterReading> {
    const meter = await this.prisma.meter.findUnique({
      where: { id: dto.meterId },
      include: { unit: { select: { id: true, siteId: true } } },
    });
    if (!meter || meter.accountId !== ctx.accountId) throw new NotFoundException();
    await this.access.assertSiteAccess(ctx, meter.unit.siteId);
    const prev = await this.prisma.meterReading.findFirst({
      where: { meterId: dto.meterId },
      orderBy: { readAt: 'desc' },
    });
    // RG19 : un index inférieur au précédent est une erreur de saisie (ou un compteur
    // changé, à déclarer comme nouveau compteur) — jamais une consommation nulle silencieuse.
    if (prev && dto.value < prev.value) {
      throw new BadRequestException({
        code: 'METER_INDEX_DECREASED',
        message: `Index inférieur au précédent (${prev.value}). Vérifiez le compteur.`,
      });
    }
    const consumption = prev ? Math.max(0, dto.value - prev.value) : 0;
    const amount = consumption * meter.unitPrice;
    const readAt = dto.readAt ? toDate(dto.readAt) : new Date();

    return this.prisma.$transaction(async (tx) => {
      let chargeId: string | null = null;
      if (dto.billOccupancy && amount > 0) {
        const occ = await tx.occupancy.findFirst({
          where: { unitId: meter.unit.id, status: { in: ['ACTIVE', 'NOTICE'] } },
          orderBy: { startDate: 'desc' },
        });
        if (occ) {
          const type = meter.type === 'WATER' ? 'EAU' : 'ELECTRICITE';
          const dueDate = new Date(readAt);
          dueDate.setDate(dueDate.getDate() + 15);
          const charge = await tx.charge.create({
            data: {
              accountId: ctx.accountId,
              occupancyId: occ.id,
              type,
              amount,
              dueDate,
              status: 'DUE',
              createdBy: ctx.userId,
            },
          });
          chargeId = charge.id;
        }
      }
      const reading = await tx.meterReading.create({
        data: {
          accountId: ctx.accountId,
          meterId: dto.meterId,
          readAt,
          value: dto.value,
          consumption,
          chargeId,
          photoKey: dto.photoKey,
          note: dto.note,
          createdBy: ctx.userId,
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId, actorId: ctx.userId,
        entity: 'meter_reading', entityId: reading.id, action: 'CREATE',
        after: { meterId: dto.meterId, value: dto.value, consumption, chargeId },
      });
      return reading;
    });
  }

  async readings(ctx: RequestContext, q: ReadingsQuery) {
    return this.prisma.meterReading.findMany({
      where: {
        accountId: ctx.accountId,
        ...(q.meterId ? { meterId: q.meterId } : {}),
        ...(q.unitId ? { meter: { unitId: q.unitId } } : {}),
        ...(q.from || q.to
          ? { readAt: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } }
          : {}),
      },
      orderBy: { readAt: 'desc' },
      take: 500,
    });
  }
}
