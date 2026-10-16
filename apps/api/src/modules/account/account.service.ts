import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateAccountDto } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireContext } from '../../common/tenancy/request-context';

const SELECT = {
  id: true,
  name: true,
  phone: true,
  logoKey: true,
  plan: true,
  subscriptionEndAt: true,
  receiptPrefix: true,
  receiptFooter: true,
} as const;

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const { accountId } = requireContext();
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: SELECT,
    });
    if (!account) throw new NotFoundException('Compte introuvable');
    return account;
  }

  async update(dto: UpdateAccountDto) {
    const { accountId } = requireContext();
    return this.prisma.account.update({
      where: { id: accountId },
      data: dto,
      select: SELECT,
    });
  }

  /**
   * Suppression définitive du compte et de toutes ses données (propriétaire seul).
   * On supprime dans l'ordre des dépendances ; les refresh_token et user_site
   * partent en cascade avec les utilisateurs et les sites.
   */
  async deleteOwn(): Promise<void> {
    const { accountId } = requireContext();
    const where = { accountId };
    await this.prisma.$transaction([
      this.prisma.allocation.deleteMany({ where }),
      this.prisma.reminder.deleteMany({ where }),
      this.prisma.payment.deleteMany({ where }),
      this.prisma.charge.deleteMany({ where }),
      this.prisma.occupancy.deleteMany({ where }),
      this.prisma.guarantor.deleteMany({ where }),
      this.prisma.tenant.deleteMany({ where }),
      this.prisma.cashHandover.deleteMany({ where }),
      this.prisma.unit.deleteMany({ where }),
      this.prisma.block.deleteMany({ where }),
      this.prisma.site.deleteMany({ where }),
      this.prisma.template.deleteMany({ where }),
      this.prisma.receiptSequence.deleteMany({ where }),
      this.prisma.auditLog.deleteMany({ where }),
      this.prisma.user.deleteMany({ where }),
      this.prisma.account.delete({ where: { id: accountId } }),
    ]);
  }
}
