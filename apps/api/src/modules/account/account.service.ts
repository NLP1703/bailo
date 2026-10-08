import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateAccountDto } from '@citegest/shared';
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
}
