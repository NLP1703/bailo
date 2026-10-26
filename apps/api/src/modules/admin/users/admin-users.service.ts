import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Prisma, UserRole as PrismaUserRole } from '@prisma/client';
import type {
  AdminUserListQuery,
  AdminUserView,
  CreateAdminUserDto,
  CreateInvitationDto,
  InvitationView,
  PaginatedResult,
  UpdateAdminUserDto,
  UserRole,
} from '@bailo/shared';
import { ADMIN_USER_ERRORS } from '@bailo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BillingService } from '../../../common/billing/billing.service';
import { AuditService } from '../../../common/audit/audit.service';
import { OtpService } from '../../auth/otp.service';
import { TokenService } from '../../auth/token.service';
import type { RequestContext } from '../../../common/tenancy/request-context';
import { AppException } from '../../../common/http/app.exception';

/**
 * Gestion de l'équipe côté Admin (OWNER uniquement, @Roles au contrôleur).
 *
 * Règles d'intégrité (Lot 2) :
 *  - Le dernier OWNER actif d'un compte ne peut jamais être désactivé ni
 *    rétrogradé (sinon le compte deviendrait sans propriétaire).
 *  - Un utilisateur ne peut jamais modifier son propre rôle ni se désactiver
 *    lui-même via les routes Admin (évite les erreurs de clic avec blocage).
 *  - La désactivation vaut archivage : les sessions sont révoquées
 *    immédiatement et le refresh suivant retombera en 401. On ne « supprime »
 *    jamais un utilisateur avec historique financier (cf. UsersService existant).
 *  - Chaque création/modification/désactivation/invitation/révocation est
 *    tracée dans AuditLog via AuditService (dans la même transaction que
 *    l'écriture concernée).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  // ─── Liste paginée ─────────────────────────────────────────────────────────

  async list(ctx: RequestContext, q: AdminUserListQuery): Promise<PaginatedResult<AdminUserView>> {
    const where: Prisma.UserWhereInput = { accountId: ctx.accountId };
    if (q.role) where.role = q.role as PrismaUserRole;
    if (q.active !== undefined) where.active = q.active;
    if (q.search) {
      const term = q.search;
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          sites: { select: { site: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    return {
      items: rows.map((u) => this.toView(u)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  // ─── Création directe (sans jeton) ─────────────────────────────────────────

  async create(ctx: RequestContext, dto: CreateAdminUserDto): Promise<AdminUserView> {
    await this.billing.assertUserQuota(ctx.accountId, 1);
    await this.assertSitesBelongToAccount(ctx.accountId, dto.siteIds);
    const passwordHash = await argon2.hash(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          accountId: ctx.accountId,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          role: dto.role as PrismaUserRole,
          createdBy: ctx.userId,
          sites: { create: dto.siteIds.map((siteId) => ({ siteId })) },
        },
        include: { sites: { select: { site: { select: { id: true, name: true } } } } },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'user',
        entityId: user.id,
        action: 'CREATE',
        after: { name: user.name, role: user.role, phone: user.phone, siteIds: dto.siteIds },
      });
      return user;
    });
    return this.toView(created);
  }

  // ─── Mise à jour partielle ────────────────────────────────────────────────

  async update(
    ctx: RequestContext,
    id: string,
    dto: UpdateAdminUserDto,
  ): Promise<AdminUserView> {
    const existing = await this.prisma.user.findFirst({
      where: { id, accountId: ctx.accountId },
      include: { sites: { select: { siteId: true } } },
    });
    if (!existing) throw this.notFound();

    // Garde-fous : jamais sur soi-même pour rôle/désactivation.
    if (id === ctx.userId && dto.role && dto.role !== existing.role) {
      throw new BadRequestException({
        code: ADMIN_USER_ERRORS.SELF_ROLE_CHANGE,
        message: "Vous ne pouvez pas modifier votre propre rôle",
      });
    }
    if (id === ctx.userId && dto.active === false) {
      throw new BadRequestException({
        code: ADMIN_USER_ERRORS.SELF_DEACTIVATE,
        message: "Vous ne pouvez pas vous désactiver vous-même",
      });
    }

    // Dernier OWNER actif : ni rétrogradation, ni désactivation.
    const willLoseOwner =
      existing.role === 'OWNER' &&
      ((dto.role && dto.role !== 'OWNER') || dto.active === false);
    if (willLoseOwner) {
      await this.assertNotLastOwner(ctx.accountId, id);
    }

    if (dto.siteIds) await this.assertSitesBelongToAccount(ctx.accountId, dto.siteIds);

    const before = {
      name: existing.name,
      email: existing.email,
      role: existing.role,
      active: existing.active,
      siteIds: existing.sites.map((s) => s.siteId),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          // email: null explicite si fourni null, sinon on garde
          ...(dto.email === null ? { email: null } : dto.email ? { email: dto.email } : {}),
          role: (dto.role as PrismaUserRole | undefined) ?? undefined,
          active: dto.active,
          ...(dto.siteIds
            ? { sites: { deleteMany: {}, create: dto.siteIds.map((siteId) => ({ siteId })) } }
            : {}),
        },
        include: { sites: { select: { site: { select: { id: true, name: true } } } } },
      });

      // Désactivation ⇒ révoque immédiatement toutes les sessions actives.
      if (dto.active === false && existing.active) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'user',
        entityId: id,
        action: 'UPDATE',
        before,
        after: {
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          siteIds: user.sites.map((s) => s.site.id),
        },
      });
      return user;
    });

    return this.toView(updated);
  }

  // ─── Réinitialisation de mot de passe (envoi OTP) ─────────────────────────

  async resetPassword(ctx: RequestContext, id: string): Promise<{ email: string }> {
    const user = await this.prisma.user.findFirst({ where: { id, accountId: ctx.accountId } });
    if (!user) throw this.notFound();
    if (!user.email) throw new AppException('USER_EMAIL_REQUIRED', 400);
    // Le même code PASSWORD_RESET que « Mot de passe oublié », envoyé à l'e-mail de l'utilisateur.
    await this.otp.request({ phone: user.phone, email: user.email }, 'PASSWORD_RESET');
    await this.audit.log(this.prisma, {
      accountId: ctx.accountId,
      actorId: ctx.userId,
      entity: 'user',
      entityId: id,
      action: 'UPDATE',
      reason: 'ADMIN_RESET_PASSWORD_OTP_SENT',
    });
    return { email: user.email };
  }

  // ─── Révocation forcée de toutes les sessions ─────────────────────────────

  async revokeSessions(ctx: RequestContext, id: string): Promise<{ revoked: number }> {
    const user = await this.prisma.user.findFirst({ where: { id, accountId: ctx.accountId } });
    if (!user) throw this.notFound();
    const before = await this.prisma.refreshToken.count({
      where: { userId: id, revokedAt: null },
    });
    await this.tokens.revokeAllForUser(id);
    await this.audit.log(this.prisma, {
      accountId: ctx.accountId,
      actorId: ctx.userId,
      entity: 'user',
      entityId: id,
      action: 'UPDATE',
      reason: 'ADMIN_REVOKE_SESSIONS',
      before: { activeSessions: before },
      after: { activeSessions: 0 },
    });
    return { revoked: before };
  }

  // ─── Invitations ──────────────────────────────────────────────────────────

  async listInvitations(ctx: RequestContext): Promise<InvitationView[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((i) => this.toInvitationView(i));
  }

  async createInvitation(
    ctx: RequestContext,
    dto: CreateInvitationDto,
  ): Promise<InvitationView> {
    await this.billing.assertUserQuota(ctx.accountId, 1);
    await this.assertSitesBelongToAccount(ctx.accountId, dto.siteIds);

    // Jeton opaque, haché avec SHA-256 (préférable à argon2 ici : besoin de
    // lookup par égalité). Le clair n'est jamais stocké, le serveur le renvoie
    // UNE SEULE FOIS dans la réponse de création.
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + dto.ttlHours * 3_600_000);

    const invitation = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invitation.create({
        data: {
          accountId: ctx.accountId,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          role: dto.role as PrismaUserRole,
          siteIds: dto.siteIds,
          tokenHash,
          expiresAt,
          createdBy: ctx.userId,
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'invitation',
        entityId: inv.id,
        action: 'CREATE',
        after: {
          name: inv.name,
          role: inv.role,
          phone: inv.phone,
          siteIds: dto.siteIds,
          expiresAt: inv.expiresAt,
        },
      });
      return inv;
    });

    // Pas d'envoi automatique : il n'existe pas encore d'écran d'acceptation
    // (/invite/:token). Le jeton et l'URL sont renvoyés à l'OWNER, qui les partage
    // par le canal de son choix.

    const view = this.toInvitationView(invitation);
    view.token = rawToken;
    view.acceptUrl = `/invite/${rawToken}`;
    return view;
  }

  async revokeInvitation(ctx: RequestContext, id: string): Promise<InvitationView> {
    const inv = await this.prisma.invitation.findFirst({
      where: { id, accountId: ctx.accountId },
    });
    if (!inv) {
      throw new NotFoundException({
        code: ADMIN_USER_ERRORS.INVITATION_NOT_FOUND,
        message: 'Invitation introuvable',
      });
    }
    if (inv.revokedAt) return this.toInvitationView(inv);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.invitation.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'invitation',
        entityId: id,
        action: 'VOID',
      });
      return u;
    });
    return this.toInvitationView(updated);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async assertSitesBelongToAccount(accountId: string, siteIds: string[]): Promise<void> {
    if (siteIds.length === 0) return;
    const count = await this.prisma.site.count({
      where: { id: { in: siteIds }, accountId },
    });
    if (count !== new Set(siteIds).size) {
      throw new BadRequestException('Un ou plusieurs sites sont invalides');
    }
  }

  private async assertNotLastOwner(accountId: string, excludeUserId: string): Promise<void> {
    const otherOwners = await this.prisma.user.count({
      where: { accountId, role: 'OWNER', active: true, id: { not: excludeUserId } },
    });
    if (otherOwners === 0) {
      throw new ConflictException({
        code: ADMIN_USER_ERRORS.LAST_OWNER,
        message:
          "Impossible : il doit toujours rester au moins un propriétaire actif sur le compte",
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ADMIN_USER_ERRORS.USER_NOT_FOUND,
      message: 'Utilisateur introuvable',
    });
  }

  private toView(user: {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    role: PrismaUserRole;
    active: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
    invitedAt: Date | null;
    sites: { site: { id: string; name: string } }[];
  }): AdminUserView {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role as UserRole,
      active: user.active,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      invitedAt: user.invitedAt?.toISOString() ?? null,
      sites: user.sites.map((s) => ({ id: s.site.id, name: s.site.name })),
    };
  }

  private toInvitationView(inv: {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    role: PrismaUserRole;
    siteIds: unknown;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
  }): InvitationView {
    const siteIds = Array.isArray(inv.siteIds) ? (inv.siteIds as string[]) : [];
    return {
      id: inv.id,
      name: inv.name,
      email: inv.email,
      phone: inv.phone,
      role: inv.role as UserRole,
      siteIds,
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
      usedAt: inv.usedAt?.toISOString() ?? null,
      revokedAt: inv.revokedAt?.toISOString() ?? null,
    };
  }
}
