import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatFcfa, type ExportQuery, type ExportType } from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import { toDate } from '../../common/time/to-date';
import type { RequestContext } from '../../common/tenancy/request-context';
import { PDF_RENDERER, type PdfRenderer } from '../pdf/pdf.renderer';
import { ReportsService } from './reports.service';

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(';'), ...rows.map((r) => r.map(csvCell).join(';'))];
  return `﻿${lines.join('\r\n')}`; // BOM pour Excel (UTF-8)
}

function toHtmlTable(title: string, headers: string[], rows: unknown[][]): string {
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
  <style>body{font-family:Arial;font-size:12px}h1{font-size:16px}
  table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px;text-align:left}</style>
  </head><body><h1>${title}</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

function formatDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SiteAccessService,
    private readonly reports: ReportsService,
    @Inject(PDF_RENDERER) private readonly pdf: PdfRenderer,
  ) {}

  async export(ctx: RequestContext, type: ExportType, query: ExportQuery): Promise<ExportResult> {
    const { title, headers, rows } = await this.dataset(ctx, type, query);
    if (query.format === 'pdf') {
      const doc = await this.pdf.render(toHtmlTable(title, headers, rows));
      const ext = doc.contentType === 'application/pdf' ? 'pdf' : 'html';
      return { buffer: doc.buffer, contentType: doc.contentType, filename: `${type}.${ext}` };
    }
    return {
      buffer: Buffer.from(toCsv(headers, rows), 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      filename: `${type}.csv`,
    };
  }

  private async dataset(ctx: RequestContext, type: ExportType, query: ExportQuery) {
    switch (type) {
      case 'payments':
        return this.paymentsDataset(ctx, query);
      case 'arrears':
        return this.arrearsDataset(ctx, query);
      case 'tenants':
        return this.tenantsDataset();
      default:
        return { title: '', headers: [], rows: [] };
    }
  }

  private async scope(ctx: RequestContext, siteId?: string): Promise<string[] | null> {
    const ids = await this.access.accessibleSiteIds(ctx);
    if (siteId) return [siteId];
    return ids === 'ALL' ? null : ids;
  }

  private async paymentsDataset(ctx: RequestContext, query: ExportQuery) {
    const scope = await this.scope(ctx, query.siteId);
    const paidAt: Prisma.DateTimeFilter = {
      ...(query.from ? { gte: toDate(query.from) } : {}),
      ...(query.to ? { lte: toDate(query.to) } : {}),
    };
    const payments = await this.prisma.payment.findMany({
      where: {
        ...(query.from || query.to ? { paidAt } : {}),
        ...(scope ? { occupancy: { unit: { siteId: { in: scope } } } } : {}),
      },
      orderBy: { paidAt: 'asc' },
      include: { occupancy: { include: { unit: true, tenant: true } } },
    });
    return {
      title: 'Paiements',
      headers: ['Date', 'Reçu', 'Locataire', 'Chambre', 'Mode', 'Montant', 'Statut'],
      rows: payments.map((p) => [
        formatDate(p.paidAt),
        p.receiptNumber,
        p.occupancy.tenant.name,
        p.occupancy.unit.code,
        p.mode,
        formatFcfa(p.amount),
        p.status,
      ]),
    };
  }

  private async arrearsDataset(ctx: RequestContext, query: ExportQuery) {
    const rows = await this.reports.arrears(ctx, { siteId: query.siteId, sort: 'age' });
    return {
      title: 'Impayés',
      headers: [
        'Locataire',
        'Téléphone',
        'Chambre',
        'Type',
        'Échéance',
        'Jours de retard',
        'Reste dû',
      ],
      rows: rows.map((r) => [
        r.tenantName,
        r.tenantPhone ?? '',
        r.unitCode,
        r.type,
        formatDate(r.dueDate),
        r.daysLate,
        formatFcfa(r.remaining),
      ]),
    };
  }

  private async tenantsDataset() {
    const tenants = await this.prisma.tenant.findMany({ orderBy: { name: 'asc' } });
    return {
      title: 'Locataires',
      headers: ['Nom', 'Téléphone', 'WhatsApp', 'Profession/École', 'Archivé'],
      rows: tenants.map((t) => [
        t.name,
        t.phone ?? '',
        t.whatsapp ?? '',
        t.occupation ?? '',
        t.archived ? 'oui' : 'non',
      ]),
    };
  }
}
