import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateGuarantorDto,
  CreateTenantDto,
  ListTenantsQuery,
  UpdateGuarantorDto,
  UpdateTenantDto,
} from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireContext } from '../../common/tenancy/request-context';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({ data: { ...dto, accountId: requireContext().accountId } });
  }

  /**
   * Recherche par nom / téléphone / WhatsApp (insensible à la casse).
   * La recherche par numéro de chambre nécessite les occupations → Lot 3.
   */
  async list(query: ListTenantsQuery) {
    const q = query.q?.trim();
    return this.prisma.tenant.findMany({
      where: {
        archived: query.archived ?? false,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
                { whatsapp: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        guarantors: { orderBy: { createdAt: 'asc' } },
        occupancies: {
          orderBy: { startDate: 'desc' },
          include: { unit: { select: { code: true } } },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Locataire introuvable');
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.get(id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
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
