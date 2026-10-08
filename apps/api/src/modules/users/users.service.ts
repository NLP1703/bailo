import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { InviteUserDto, MeView, UpdateUserDto, UserView } from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireContext, type RequestContext } from '../../common/tenancy/request-context';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Invite un gérant ou un gardien et l'assigne à des sites (propriétaire seul). */
  async invite(dto: InviteUserDto): Promise<UserView> {
    await this.assertSitesBelongToAccount(dto.siteIds);
    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        accountId: requireContext().accountId,
        name: dto.name,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        sites: { create: dto.siteIds.map((siteId) => ({ siteId })) },
      },
      include: { sites: { select: { siteId: true } } },
    });

    return this.toView(user);
  }

  async list(): Promise<UserView[]> {
    const users = await this.prisma.user.findMany({
      include: { sites: { select: { siteId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => this.toView(user));
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserView> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (existing.role === 'OWNER' && (dto.role || dto.active === false)) {
      throw new BadRequestException('Le propriétaire ne peut être ni rétrogradé ni désactivé');
    }
    if (dto.siteIds) {
      await this.assertSitesBelongToAccount(dto.siteIds);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        active: dto.active,
        ...(dto.siteIds
          ? { sites: { deleteMany: {}, create: dto.siteIds.map((siteId) => ({ siteId })) } }
          : {}),
      },
      include: { sites: { select: { siteId: true } } },
    });
    return this.toView(user);
  }

  async me(ctx: RequestContext): Promise<MeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      include: { sites: { select: { siteId: true } }, account: { select: { name: true } } },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return { ...this.toView(user), accountId: user.accountId, accountName: user.account.name };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertSitesBelongToAccount(siteIds: string[]): Promise<void> {
    if (siteIds.length === 0) return;
    // Le filtrage par compte est appliqué par le middleware : un site d'un autre
    // compte est simplement introuvable, donc le compte ne correspondra pas.
    const count = await this.prisma.site.count({ where: { id: { in: siteIds } } });
    if (count !== new Set(siteIds).size) {
      throw new BadRequestException('Un ou plusieurs sites sont invalides');
    }
  }

  private toView(user: {
    id: string;
    name: string;
    phone: string;
    role: UserView['role'];
    active: boolean;
    sites: { siteId: string }[];
  }): UserView {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      active: user.active,
      siteIds: user.sites.map((site) => site.siteId),
    };
  }
}
