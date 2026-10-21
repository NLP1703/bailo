import { Injectable } from '@nestjs/common';
import type { ReminderStage } from '@prisma/client';
import type { ListTemplatesQuery, UpsertTemplateDto } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { requireContext } from '../../common/tenancy/request-context';
import { DEFAULT_REMINDER_MESSAGES } from './default-templates';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListTemplatesQuery) {
    return this.prisma.template.findMany({
      where: {
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.locale ? { locale: query.locale } : {}),
      },
      orderBy: [{ kind: 'asc' }, { locale: 'asc' }],
    });
  }

  /**
   * Crée ou met à jour un modèle ; un seul « par défaut » par (kind, locale, stage).
   * Trace la création ou la modification dans `audit_log` (avant/après).
   */
  async upsert(dto: UpsertTemplateDto) {
    const { accountId, userId } = requireContext();
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.template.updateMany({
          where: { kind: dto.kind, locale: dto.locale, stage: dto.stage ?? null, isDefault: true },
          data: { isDefault: false },
        });
      }
      const data = {
        kind: dto.kind,
        name: dto.name,
        locale: dto.locale,
        stage: dto.stage,
        bodyHtml: dto.bodyHtml,
        isDefault: dto.isDefault,
      };
      const before = dto.id
        ? await tx.template.findUnique({
            where: { id: dto.id },
            select: { name: true, isDefault: true, bodyHtml: true },
          })
        : null;
      const row = dto.id
        ? await tx.template.update({ where: { id: dto.id }, data })
        : await tx.template.create({ data: { ...data, accountId } });
      await this.audit.log(tx, {
        accountId,
        actorId: userId,
        entity: 'template',
        entityId: row.id,
        action: before ? 'UPDATE' : 'CREATE',
        before: before ?? undefined,
        after: { name: row.name, isDefault: row.isDefault, bodyHtml: row.bodyHtml },
      });
      return row;
    });
  }

  /**
   * Corps du message de relance : modèle personnalisé du compte (par défaut en priorité),
   * sinon message intégré FR/EN.
   */
  async reminderBody(stage: ReminderStage, locale: string): Promise<string> {
    const custom = await this.prisma.template.findFirst({
      where: { kind: 'REMINDER', stage, locale },
      orderBy: { isDefault: 'desc' },
    });
    if (custom) return custom.bodyHtml;
    const fallback = DEFAULT_REMINDER_MESSAGES[stage];
    return locale === 'en' ? fallback.en : fallback.fr;
  }
}
