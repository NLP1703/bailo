import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Prisma, UserRole as PrismaUserRole } from '@prisma/client';
import type {
  AcceptInvitationDto,
  AdminUserListQuery,
  AdminUserView,
  CreateAdminUserDto,
  CreateInvitationDto,
  InvitationPreview,
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
import { APP_ENV, publicAppUrl, type AppEnv } from '../../../common/config/env';
import { MAIL_PROVIDER, maskEmail, type MailProvider } from '../../mail/mail.provider';
import { invitationMail } from '../../mail/mail.templates';

/** Durée de validité d'une invitation renvoyée (heures). */
const RESEND_TTL_HOURS = 72;

const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

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
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    @Inject(APP_ENV) private readonly env: AppEnv,
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
    await this.assertIdentityAvailable(ctx.accountId, dto.email, dto.phone);

    // Jeton opaque, haché avec SHA-256 (préférable à argon2 ici : besoin de
    // lookup par égalité). Le clair n'est jamais stocké : il part dans l'e-mail
    // et n'est renvoyé à l'OWNER qu'une seule fois (lien de secours à copier).
    const rawToken = randomBytes(32).toString('base64url');
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
          tokenHash: hashToken(rawToken),
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
          email: inv.email,
          siteIds: dto.siteIds,
          expiresAt: inv.expiresAt,
        },
      });
      return inv;
    });

    return this.withLink(invitation, rawToken, await this.sendInvitationMail(invitation, rawToken));
  }

  /**
   * Renvoie l'e-mail d'une invitation en attente. Le jeton précédent n'étant
   * jamais stocké en clair, un nouveau est généré (l'ancien lien cesse de
   * fonctionner) et la validité repart pour 72 h.
   */
  async resendInvitation(ctx: RequestContext, id: string): Promise<InvitationView> {
    const inv = await this.prisma.invitation.findFirst({ where: { id, accountId: ctx.accountId } });
    if (!inv) {
      throw new NotFoundException({
        code: ADMIN_USER_ERRORS.INVITATION_NOT_FOUND,
        message: 'Invitation introuvable',
      });
    }
    if (inv.usedAt || inv.revokedAt) {
      throw new GoneException({
        code: ADMIN_USER_ERRORS.INVITATION_INVALID,
        message: 'Cette invitation a déjà été acceptée ou révoquée',
      });
    }
    if (!inv.email) {
      throw new BadRequestException({
        code: ADMIN_USER_ERRORS.INVITATION_EMAIL_REQUIRED,
        message: "Cette invitation n'a pas d'adresse e-mail : révoquez-la et invitez à nouveau avec un e-mail",
      });
    }

    const rawToken = randomBytes(32).toString('base64url');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.invitation.update({
        where: { id },
        data: {
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + RESEND_TTL_HOURS * 3_600_000),
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'invitation',
        entityId: id,
        action: 'UPDATE',
        reason: 'INVITATION_RESENT',
        before: { expiresAt: inv.expiresAt },
        after: { expiresAt: u.expiresAt },
      });
      return u;
    });

    return this.withLink(updated, rawToken, await this.sendInvitationMail(updated, rawToken));
  }

  // ─── Acceptation publique (lien reçu par e-mail) ─────────────────────────

  /** Aperçu d'une invitation valide, pour la page /invite/:token. */
  async previewInvitation(rawToken: string): Promise<InvitationPreview> {
    const inv = await this.findValidInvitation(rawToken);
    return {
      name: inv.name,
      email: inv.email,
      role: inv.role as UserRole,
      accountName: inv.account.name,
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  /**
   * Accepte une invitation : crée l'utilisateur avec le mot de passe choisi,
   * consomme l'invitation (une seule fois) et renvoie de quoi ouvrir la session.
   */
  async acceptInvitation(
    rawToken: string,
    dto: AcceptInvitationDto,
  ): Promise<{ id: string; accountId: string; role: PrismaUserRole }> {
    const inv = await this.findValidInvitation(rawToken);
    await this.billing.assertUserQuota(inv.accountId, 1);
    await this.assertIdentityAvailable(inv.accountId, inv.email, inv.phone);

    const requested = Array.isArray(inv.siteIds) ? (inv.siteIds as string[]) : [];
    // Un site supprimé entre-temps est simplement ignoré.
    const sites = requested.length
      ? await this.prisma.site.findMany({
          where: { id: { in: requested }, accountId: inv.accountId },
          select: { id: true },
        })
      : [];
    const passwordHash = await argon2.hash(dto.password);

    return this.prisma.$transaction(async (tx) => {
      // Consommation atomique : deux clics simultanés ne créent qu'un compte.
      const consumed = await tx.invitation.updateMany({
        where: { id: inv.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw this.invalidInvitation();

      const user = await tx.user.create({
        data: {
          accountId: inv.accountId,
          name: inv.name,
          email: inv.email,
          phone: inv.phone,
          passwordHash,
          role: inv.role,
          createdBy: inv.createdBy,
          invitedAt: inv.createdAt,
          sites: { create: sites.map((s) => ({ siteId: s.id })) },
        },
      });
      await this.audit.log(tx, {
        accountId: inv.accountId,
        actorId: user.id,
        entity: 'user',
        entityId: user.id,
        action: 'CREATE',
        reason: 'INVITATION_ACCEPTED',
        after: { name: user.name, role: user.role, phone: user.phone, invitationId: inv.id },
      });
      return { id: user.id, accountId: user.accountId, role: user.role };
    });
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

  private async findValidInvitation(rawToken: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { account: { select: { name: true } } },
    });
    if (!inv || inv.usedAt || inv.revokedAt || inv.expiresAt <= new Date()) {
      throw this.invalidInvitation();
    }
    return inv;
  }

  private invalidInvitation(): GoneException {
    return new GoneException({
      code: ADMIN_USER_ERRORS.INVITATION_INVALID,
      message: "Ce lien d'invitation n'est plus valable (expiré, révoqué ou déjà utilisé)",
    });
  }

  /** L'e-mail est unique sur tout Bailo ; le numéro, au sein du compte. */
  private async assertIdentityAvailable(
    accountId: string,
    email: string | null | undefined,
    phone: string,
  ): Promise<void> {
    if (email) {
      const taken = await this.prisma.user.count({ where: { email } });
      if (taken) {
        throw new ConflictException({
          code: ADMIN_USER_ERRORS.EMAIL_TAKEN,
          message: 'Cette adresse e-mail est déjà utilisée par un compte Bailo',
        });
      }
    }
    const phoneTaken = await this.prisma.user.count({ where: { accountId, phone } });
    if (phoneTaken) {
      throw new ConflictException({
        code: ADMIN_USER_ERRORS.PHONE_TAKEN,
        message: "Ce numéro est déjà celui d'un membre de votre équipe",
      });
    }
  }

  /** Envoie l'e-mail d'invitation ; un échec d'envoi ne bloque pas (lien de secours). */
  private async sendInvitationMail(
    inv: { accountId: string; name: string; email: string | null; role: PrismaUserRole; expiresAt: Date },
    rawToken: string,
  ): Promise<boolean> {
    if (!inv.email) return false;
    try {
      const account = await this.prisma.account.findUnique({
        where: { id: inv.accountId },
        select: { name: true },
      });
      await this.mail.send(
        invitationMail(inv.email, {
          name: inv.name,
          accountName: account?.name ?? 'Votre bailleur',
          role: inv.role,
          url: this.acceptUrl(rawToken),
          expiresAt: inv.expiresAt,
        }),
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Invitation non envoyée à ${maskEmail(inv.email)} : ${(error as Error).message}`,
      );
      return false;
    }
  }

  private acceptUrl(rawToken: string): string {
    return `${publicAppUrl(this.env)}/invite/${rawToken}`;
  }

  private withLink(
    inv: Parameters<AdminUsersService['toInvitationView']>[0],
    rawToken: string,
    emailSent: boolean,
  ): InvitationView {
    const view = this.toInvitationView(inv);
    view.token = rawToken;
    view.acceptUrl = this.acceptUrl(rawToken);
    view.emailSent = emailSent;
    return view;
  }

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
