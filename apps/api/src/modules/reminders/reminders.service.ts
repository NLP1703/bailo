import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, ReminderRecipient } from '@prisma/client';
import {
  dueReminderStage,
  formatFcfa,
  renderTemplate,
  type MarkReminderSentDto,
  type RemindersHistoryQuery,
  type RemindersTodayQuery,
} from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toDate } from '../../common/time/to-date';
import type { RequestContext } from '../../common/tenancy/request-context';
import { TemplatesService } from '../templates/templates.service';

function formatDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
  ) {}

  /**
   * Génère (idempotent, 1 par échéance+palier) les relances dues à `today` (RG11/RG12),
   * puis renvoie les relances PENDING du jour, groupées par palier.
   */
  async today(ctx: RequestContext, query: RemindersTodayQuery) {
    const today = query.date ? toDate(query.date) : new Date();
    const locale = query.locale ?? 'fr';
    await this.generateForDate(this.prisma, today, { siteId: query.siteId, locale });

    const reminders = await this.prisma.reminder.findMany({
      where: { status: 'PENDING', scheduledFor: { lte: today } },
      orderBy: [{ stage: 'asc' }, { scheduledFor: 'asc' }],
      include: {
        charge: {
          include: { occupancy: { include: { unit: true, tenant: true } } },
        },
      },
    });

    const byStage: Record<string, unknown[]> = {};
    for (const r of reminders) {
      (byStage[r.stage] ??= []).push({
        id: r.id,
        stage: r.stage,
        recipient: r.recipient,
        channel: r.channel,
        message: r.message,
        tenantName: r.charge.occupancy.tenant.name,
        unitCode: r.charge.occupancy.unit.code,
        dueDate: r.charge.dueDate,
      });
    }
    return { date: today, total: reminders.length, byStage };
  }

  /** Cœur de la génération — réutilisé par le job quotidien (BullMQ). */
  async generateForDate(
    db: DbClient,
    today: Date,
    opts: { siteId?: string; locale?: string } = {},
  ): Promise<number> {
    const locale = opts.locale ?? 'fr';
    const charges = await db.charge.findMany({
      where: {
        status: { not: 'CANCELLED' },
        occupancy: {
          status: { in: ['ACTIVE', 'NOTICE'] },
          ...(opts.siteId ? { unit: { siteId: opts.siteId } } : {}),
        },
      },
      include: {
        allocations: { where: { payment: { status: 'VALID' } }, select: { amount: true } },
        occupancy: {
          include: { unit: { include: { site: true } }, tenant: { include: { guarantors: true } } },
        },
      },
    });

    let created = 0;
    for (const charge of charges) {
      const paid = charge.allocations.reduce((s, a) => s + a.amount, 0);
      const remaining = charge.amount - paid;
      const site = charge.occupancy.unit.site;
      const stage = dueReminderStage({
        dueDate: charge.dueDate,
        today,
        remaining,
        cancelled: false,
        paliers: site,
      });
      if (!stage) continue;

      const existing = await db.reminder.findUnique({
        where: { chargeId_stage: { chargeId: charge.id, stage } },
      });
      if (existing && existing.status === 'SENT') continue;

      const tenant = charge.occupancy.tenant;
      const primaryPayer = tenant.guarantors.find((g) => g.isPrimaryPayer);
      const recipient: ReminderRecipient = primaryPayer ? 'BOTH' : 'TENANT';
      const body = await this.templates.reminderBody(stage, locale);
      const message = renderTemplate(body, {
        nom: tenant.name,
        chambre: charge.occupancy.unit.code,
        montant: formatFcfa(remaining),
        date: formatDate(charge.dueDate),
      });

      if (existing) {
        await db.reminder.update({ where: { id: existing.id }, data: { message, recipient } });
      } else {
        await db.reminder.create({
          data: {
            accountId: charge.accountId,
            chargeId: charge.id,
            stage,
            recipient,
            channel: 'WHATSAPP',
            message,
            status: 'PENDING',
            scheduledFor: today,
          },
        });
        created += 1;
      }
    }
    return created;
  }

  async markSent(ctx: RequestContext, id: string, dto: MarkReminderSentDto) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder) throw new NotFoundException('Relance introuvable');
    return this.prisma.reminder.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        recipient: dto.recipient ?? reminder.recipient,
        channel: dto.channel ?? reminder.channel,
      },
    });
  }

  async history(query: RemindersHistoryQuery) {
    return this.prisma.reminder.findMany({
      where: {
        status: 'SENT',
        ...(query.tenantId ? { charge: { occupancy: { tenantId: query.tenantId } } } : {}),
      },
      orderBy: { sentAt: 'desc' },
      include: { charge: { include: { occupancy: { include: { unit: true, tenant: true } } } } },
    });
  }

  /** Lien wa.me pré-rempli (F7.1) pour le(s) destinataire(s) de la relance. */
  async waLink(id: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id },
      include: {
        charge: {
          include: { occupancy: { include: { tenant: { include: { guarantors: true } } } } },
        },
      },
    });
    if (!reminder) throw new NotFoundException('Relance introuvable');

    const tenant = reminder.charge.occupancy.tenant;
    const primaryPayer = tenant.guarantors.find((g) => g.isPrimaryPayer);
    const text = encodeURIComponent(reminder.message);

    const links: { to: string; phone: string; url: string }[] = [];
    const push = (to: string, phone?: string | null) => {
      if (phone) links.push({ to, phone, url: `https://wa.me/${sanitize(phone)}?text=${text}` });
    };
    if (reminder.recipient === 'TENANT' || reminder.recipient === 'BOTH') {
      push('locataire', tenant.whatsapp ?? tenant.phone);
    }
    if (reminder.recipient === 'GUARANTOR' || reminder.recipient === 'BOTH') {
      push('parent', primaryPayer?.whatsapp ?? primaryPayer?.phone);
    }
    return { reminderId: id, message: reminder.message, links };
  }
}

/** Numéro au format international sans « + » ni espaces pour l'URL wa.me. */
function sanitize(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}
