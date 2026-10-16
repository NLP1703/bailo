import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { InviteUserDto, MeView, UpdateUserDto, UserView } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../../common/billing/billing.service';
import { requireContext, type RequestContext } from '../../common/tenancy/request-context';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /** Invite un gérant ou un gardien et l'assigne à des sites (propriétaire seul). */
  async invite(dto: InviteUserDto): Promise<UserView> {
    const { accountId } = requireContext();
    await this.billing.assertUserQuota(accountId, 1);
    await this.assertSitesBelongToAccount(dto.siteIds);
    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        accountId: requireContext().accountId,
        name: dto.name,
        email: dto.email,
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
        email: dto.email,
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

  /**
   * Supprime un utilisateur (OWNER seul). Garde-fous conformes à F1.4 / NF11 :
   * - jamais le propriétaire, jamais soi-même ;
   * - jamais un utilisateur avec un historique financier (paiements encaissés ou
   *   remises de caisse) — on le désactive alors, pour ne rien perdre de la trace.
   */
  async remove(id: string, ctx: RequestContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (user.role === 'OWNER') {
      throw new BadRequestException('Le propriétaire ne peut pas être supprimé');
    }
    if (id === ctx.userId) {
      throw new BadRequestException('Vous ne pouvez pas supprimer votre propre compte');
    }

    const [payments, handovers] = await Promise.all([
      this.prisma.payment.count({ where: { receivedBy: id } }),
      this.prisma.cashHandover.count({ where: { collectorId: id } }),
    ]);
    if (payments > 0 || handovers > 0) {
      throw new ConflictException(
        "Cet utilisateur a un historique financier : désactivez-le plutôt que de le supprimer",
      );
    }

    // Les jetons et affectations de sites sont supprimés en cascade (schéma Prisma).
    await this.prisma.user.delete({ where: { id } });
  }

  /**
   * Suppression de son propre compte utilisateur (gérant / gardien). Le
   * propriétaire passe par la suppression du compte entier (AccountService).
   * Les paiements déjà encaissés ne sont jamais supprimés (RG8) : seule la
   * fiche de connexion disparaît.
   */
  async removeSelf(ctx: RequestContext): Promise<void> {
    if (ctx.role === 'OWNER') {
      throw new BadRequestException(
        'Le propriétaire supprime son compte via la suppression du compte entier',
      );
    }
    await this.prisma.user.delete({ where: { id: ctx.userId } });
  }

  async me(ctx: RequestContext): Promise<MeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      include: {
        sites: { select: { siteId: true } },
        account: { select: { name: true, plan: true, subscriptionEndAt: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return {
      ...this.toView(user),
      accountId: user.accountId,
      accountName: user.account.name,
      plan: user.account.plan,
      readOnly: await this.billing.isReadOnly(user.accountId),
    };
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
    email: string | null;
    phone: string;
    role: UserView['role'];
    active: boolean;
    sites: { siteId: string }[];
  }): UserView {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      active: user.active,
      siteIds: user.sites.map((site) => site.siteId),
    };
  }
}
