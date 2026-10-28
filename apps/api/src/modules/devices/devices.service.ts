import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Device } from '@prisma/client';
import {
  DEVICE_ERRORS,
  MAX_ACTIVE_DEVICES,
  SYNC_ERRORS,
  type DeviceView,
  type RegisterDeviceDto,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/tenancy/request-context';

type DeviceWithUser = Device & { user: { name: string } };

/**
 * Téléphones de l'équipe (RGM10 à RGM12).
 *  - deux appareils actifs au plus par utilisateur ;
 *  - le propriétaire voit tous les appareils du compte et peut en déconnecter un ;
 *  - un appareil déconnecté peut encore envoyer ce qu'il avait saisi AVANT la
 *    déconnexion, puis l'application efface sa base locale (voir SyncService).
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async register(ctx: RequestContext, dto: RegisterDeviceDto): Promise<DeviceView> {
    const existing = await this.prisma.device.findUnique({
      where: { userId_deviceKey: { userId: ctx.userId, deviceKey: dto.deviceId } },
    });
    const others = await this.prisma.device.findMany({
      where: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        revokedAt: null,
        NOT: { deviceKey: dto.deviceId },
      },
      orderBy: { lastSeenAt: 'asc' },
      include: { user: { select: { name: true } } },
    });

    if (others.length >= MAX_ACTIVE_DEVICES) {
      const toReplace = dto.replaceDeviceId
        ? others.find((d) => d.deviceKey === dto.replaceDeviceId || d.id === dto.replaceDeviceId)
        : undefined;
      if (!toReplace) {
        throw new ConflictException({
          code: DEVICE_ERRORS.LIMIT_REACHED,
          message: `Deux téléphones sont déjà actifs sur ce compte : choisissez celui à déconnecter.`,
          details: { devices: others.map((d) => this.toView(d)) },
        });
      }
      await this.revokeRow(ctx, toReplace, 'REPLACED_BY_NEW_DEVICE');
    }

    const data = {
      platform: dto.platform,
      model: dto.model ?? null,
      appVersion: dto.appVersion ?? null,
      lastSeenAt: new Date(),
      // Une nouvelle connexion par mot de passe réactive un appareil déconnecté.
      revokedAt: null,
      revokedBy: null,
    };
    const device = existing
      ? await this.prisma.device.update({
          where: { id: existing.id },
          data,
          include: { user: { select: { name: true } } },
        })
      : await this.prisma.device.create({
          data: { ...data, accountId: ctx.accountId, userId: ctx.userId, deviceKey: dto.deviceId },
          include: { user: { select: { name: true } } },
        });
    return this.toView(device);
  }

  /** Propriétaire : tous les appareils du compte ; autres rôles : les leurs. */
  async list(ctx: RequestContext): Promise<DeviceView[]> {
    const rows = await this.prisma.device.findMany({
      where: { accountId: ctx.accountId, ...(ctx.role === 'OWNER' ? {} : { userId: ctx.userId }) },
      orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { lastSeenAt: 'desc' }],
      include: { user: { select: { name: true } } },
    });
    return rows.map((d) => this.toView(d));
  }

  /** Déconnexion à distance (MP2.5) : le propriétaire, ou l'utilisateur pour ses propres appareils. */
  async revoke(ctx: RequestContext, id: string): Promise<DeviceView> {
    const device = await this.prisma.device.findFirst({
      where: { accountId: ctx.accountId, OR: [{ id }, { deviceKey: id, userId: ctx.userId }] },
      include: { user: { select: { name: true } } },
    });
    if (!device) {
      throw new NotFoundException({
        code: DEVICE_ERRORS.NOT_FOUND,
        message: 'Appareil introuvable',
      });
    }
    if (ctx.role !== 'OWNER' && device.userId !== ctx.userId) {
      throw new ForbiddenException(
        'Seul le propriétaire peut déconnecter l’appareil d’un autre membre',
      );
    }
    if (device.revokedAt) return this.toView(device);
    return this.toView(await this.revokeRow(ctx, device, 'REMOTE_SIGN_OUT'));
  }

  /**
   * Appelé à chaque envoi ou réception : met à jour la dernière activité et les opérations
   * en attente signalées par le téléphone (RGM7). Inconnu : 409 pour qu'il s'enregistre.
   */
  async touch(
    ctx: RequestContext,
    deviceKey: string,
    pending?: { pendingCount: number; oldestPendingAt: string | null },
  ): Promise<Device> {
    const device = await this.prisma.device.findUnique({
      where: { userId_deviceKey: { userId: ctx.userId, deviceKey } },
    });
    if (!device || device.accountId !== ctx.accountId) {
      throw new ConflictException({
        code: SYNC_ERRORS.DEVICE_UNKNOWN,
        message: 'Appareil non enregistré : reconnectez-vous',
      });
    }
    return this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        ...(pending
          ? {
              pendingCount: pending.pendingCount,
              oldestPendingAt: pending.oldestPendingAt ? new Date(pending.oldestPendingAt) : null,
            }
          : {}),
      },
    });
  }

  private async revokeRow(
    ctx: RequestContext,
    device: DeviceWithUser,
    reason: string,
  ): Promise<DeviceWithUser> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.device.update({
        where: { id: device.id },
        data: { revokedAt: new Date(), revokedBy: ctx.userId },
        include: { user: { select: { name: true } } },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'device',
        entityId: device.id,
        action: 'UPDATE',
        reason,
        before: { revokedAt: null },
        after: { revokedAt: updated.revokedAt, userId: device.userId },
      });
      return updated;
    });
  }

  private toView(d: DeviceWithUser): DeviceView {
    return {
      id: d.id,
      deviceId: d.deviceKey,
      userId: d.userId,
      userName: d.user.name,
      platform: d.platform,
      model: d.model,
      appVersion: d.appVersion,
      lastSeenAt: d.lastSeenAt.toISOString(),
      pendingCount: d.pendingCount,
      oldestPendingAt: d.oldestPendingAt?.toISOString() ?? null,
      revokedAt: d.revokedAt?.toISOString() ?? null,
    };
  }
}
