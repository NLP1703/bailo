import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Contract } from '@prisma/client';
import { createHash, randomInt } from 'node:crypto';
import type {
  ContractListQuery,
  CreateContractDto,
  SendForSignatureDto,
  SignContractDto,
  TerminateContractDto,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/tenancy/request-context';
import { toDate } from '../../common/time/to-date';
import { MAIL_PROVIDER, type MailProvider } from '../mail/mail.provider';
import { contractSignatureMail } from '../mail/mail.templates';
import { AppException } from '../../common/http/app.exception';
import { loadEnv } from '../../common/config/env';
import { PDF_RENDERER, type PdfRenderer, type RenderedDocument } from '../pdf/pdf.renderer';
import { listMaybePaginated } from '../../common/http/paginate';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    @Inject(PDF_RENDERER) private readonly pdf: PdfRenderer,
  ) {}

  /** Rendu PDF (ou HTML de repli) d'un contrat. */
  async renderPdf(ctx: RequestContext, id: string): Promise<{ doc: RenderedDocument; filename: string }> {
    const c = await this.prisma.contract.findUnique({ where: { id } });
    if (!c || c.accountId !== ctx.accountId) throw new NotFoundException();
    const account = await this.prisma.account.findUnique({ where: { id: ctx.accountId }, select: { name: true } });
    // Habillage minimal du corps HTML pour un rendu propre en PDF.
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<style>
  body{font:12pt/1.5 "Helvetica",sans-serif;color:#0f172a;max-width:720px;margin:30px auto;padding:0 24px}
  h1{color:#0f766e;font-size:20pt;margin-bottom:4pt}
  h2{color:#0b4e4a;font-size:13pt;margin-top:14pt;margin-bottom:4pt}
  .meta{font-size:9pt;color:#64748b;margin-bottom:16pt}
  .sign{margin-top:40pt;padding-top:10pt;border-top:1px solid #cbd5e1;font-style:italic;color:#64748b;font-size:10pt}
  .status{display:inline-block;padding:3px 10px;border-radius:12px;background:#ecfeff;color:#0f766e;font-size:9pt;font-weight:bold}
</style></head><body>
<div class="meta">${account?.name ?? 'Bailo'} · Référence ${c.reference} · <span class="status">${c.status}</span></div>
${c.bodyHtml}
${c.signedByTenant ? `<div class="sign">Signé électroniquement par le locataire le ${c.signedAt?.toISOString().slice(0,10)}.</div>` : ''}
</body></html>`;
    const doc = await this.pdf.render(html);
    const ext = doc.contentType === 'application/pdf' ? 'pdf' : 'html';
    return { doc, filename: `${c.reference}.${ext}` };
  }

  /** Génère la référence lisible : BAILO-CT-{année}-{n°6chiffres} par compte. */
  private async nextReference(accountId: string, year: number): Promise<string> {
    const count = await this.prisma.contract.count({
      where: { accountId, reference: { startsWith: `BAILO-CT-${year}-` } },
    });
    return `BAILO-CT-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  async create(ctx: RequestContext, dto: CreateContractDto): Promise<Contract> {
    const occ = await this.prisma.occupancy.findUnique({
      where: { id: dto.occupancyId },
      select: { tenantId: true, accountId: true, startDate: true },
    });
    if (!occ) throw new NotFoundException('Occupation introuvable');
    const reference = await this.nextReference(ctx.accountId, new Date(dto.startDate).getFullYear());
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.contract.create({
        data: {
          accountId: ctx.accountId,
          occupancyId: dto.occupancyId,
          tenantId: occ.tenantId,
          reference,
          status: 'DRAFT',
          monthlyRent: dto.monthlyRent,
          deposit: dto.deposit,
          startDate: toDate(dto.startDate),
          durationMonths: dto.durationMonths ?? null,
          noticeDays: dto.noticeDays,
          bodyHtml: dto.bodyHtml,
          createdBy: ctx.userId,
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'contract',
        entityId: c.id,
        action: 'CREATE',
        after: { reference, monthlyRent: dto.monthlyRent, deposit: dto.deposit },
      });
      return c;
    });
  }

  /**
   * Envoie le code de signature **par e-mail** au locataire. Le code reste rattaché
   * au téléphone du locataire s'il en a un (clé historique de `otp_code`).
   */
  async sendForSignature(ctx: RequestContext, id: string, _dto: SendForSignatureDto): Promise<Contract> {
    const c = await this.prisma.contract.findUnique({
      where: { id },
      include: { tenant: { select: { phone: true, email: true, name: true } } },
    });
    if (!c || c.accountId !== ctx.accountId) throw new NotFoundException();
    if (!c.tenant.email) throw new AppException('TENANT_EMAIL_REQUIRED', 400);
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = createHash('sha256').update(code).digest('hex');
    const env = loadEnv();
    const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);
    const account = await this.prisma.account.findUnique({
      where: { id: ctx.accountId },
      select: { name: true },
    });

    const otp = await this.prisma.otpCode.create({
      data: { phone: c.tenant.phone ?? c.tenant.email, codeHash, purpose: 'CONTRACT_SIGN', expiresAt },
    });
    await this.mail.send(
      contractSignatureMail(c.tenant.email, {
        code,
        reference: c.reference,
        tenantName: c.tenant.name,
        landlordName: account?.name ?? 'Votre bailleur',
        ttlSeconds: env.OTP_TTL_SECONDS,
      }),
    );
    return this.prisma.contract.update({
      where: { id },
      data: { status: 'PENDING_SIGNATURE', signatureOtpId: otp.id },
    });
  }

  /** Vérifie le code, marque le contrat signé et clôt la transaction. */
  async sign(ctx: RequestContext, id: string, dto: SignContractDto): Promise<Contract> {
    const c = await this.prisma.contract.findUnique({ where: { id } });
    if (!c || c.accountId !== ctx.accountId) throw new NotFoundException();
    if (c.status !== 'PENDING_SIGNATURE') throw new BadRequestException('Contrat non en attente de signature');
    if (!c.signatureOtpId) throw new BadRequestException('Aucune demande de signature en cours');
    const otp = await this.prisma.otpCode.findUnique({ where: { id: c.signatureOtpId } });
    if (!otp || otp.consumedAt || otp.expiresAt < new Date())
      throw new BadRequestException('Code expiré ou déjà utilisé');
    // Anti-force-brute : au-delà du nombre d'essais permis, il faut renvoyer un nouveau code.
    if (otp.attempts >= loadEnv().OTP_MAX_ATTEMPTS)
      throw new BadRequestException('Trop d’essais : renvoyez un nouveau code au locataire');
    const codeHash = createHash('sha256').update(dto.otpCode).digest('hex');
    if (codeHash !== otp.codeHash) {
      // Hors transaction : l'essai raté doit rester compté malgré l'erreur levée.
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Code incorrect');
    }

    return this.prisma.$transaction(async (tx) => {
      // Consommation atomique : un code ne signe qu'une fois, même en cas de double envoi.
      const consumed = await tx.otpCode.updateMany({
        where: { id: otp.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new BadRequestException('Code expiré ou déjà utilisé');
      const signed = await tx.contract.update({
        where: { id },
        data: { status: 'SIGNED', signedByTenant: true, signedAt: new Date() },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'contract',
        entityId: id,
        action: 'UPDATE',
        after: { status: 'SIGNED', tenantSignatureName: dto.tenantSignatureName, otpId: otp.id },
      });
      return signed;
    });
  }

  async terminate(ctx: RequestContext, id: string, dto: TerminateContractDto): Promise<Contract> {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.contract.findUnique({ where: { id } });
      if (!c || c.accountId !== ctx.accountId) throw new NotFoundException();
      if (c.status === 'TERMINATED') return c;
      const upd = await tx.contract.update({
        where: { id },
        data: { status: 'TERMINATED', terminatedAt: new Date(), terminationReason: dto.reason },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'contract',
        entityId: id,
        action: 'CLOSE',
        reason: dto.reason,
      });
      return upd;
    });
  }

  async list(ctx: RequestContext, q: ContractListQuery) {
    const where = {
      accountId: ctx.accountId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.tenantId ? { tenantId: q.tenantId } : {}),
      ...(q.occupancyId ? { occupancyId: q.occupancyId } : {}),
    };
    return listMaybePaginated(
      q,
      (window) =>
        this.prisma.contract.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          include: { tenant: { select: { name: true } } },
          ...window,
        }),
      () => this.prisma.contract.count({ where }),
    );
  }

  async get(ctx: RequestContext, id: string): Promise<Contract | null> {
    const c = await this.prisma.contract.findUnique({ where: { id } });
    if (!c || c.accountId !== ctx.accountId) throw new NotFoundException();
    return c;
  }

  /** Rendu HTML standard pré-rempli depuis une occupation — pour pré-remplir l'éditeur côté front. */
  async standardBodyFor(ctx: RequestContext, occupancyId: string): Promise<{ bodyHtml: string; defaults: { monthlyRent: number; deposit: number; startDate: string } }> {
    const occ = await this.prisma.occupancy.findUnique({
      where: { id: occupancyId },
      include: {
        tenant: { select: { name: true } },
        unit: { select: { code: true, siteId: true, site: { select: { name: true, city: true, district: true } } } },
      },
    });
    if (!occ || occ.accountId !== ctx.accountId) throw new NotFoundException();
    const account = await this.prisma.account.findUnique({ where: { id: ctx.accountId }, select: { name: true } });
    const bodyHtml = this.renderStandardBody({
      bailleur: account?.name ?? 'Bailo',
      locataire: occ.tenant.name,
      adresse: [occ.unit.site.name, occ.unit.site.district, occ.unit.site.city].filter(Boolean).join(', '),
      chambre: occ.unit.code,
      monthlyRent: occ.monthlyRent,
      deposit: occ.deposit,
      startDate: occ.startDate.toISOString().slice(0, 10),
      durationMonths: null,
      noticeDays: 30,
    });
    return {
      bodyHtml,
      defaults: {
        monthlyRent: occ.monthlyRent,
        deposit: occ.deposit,
        startDate: occ.startDate.toISOString().slice(0, 10),
      },
    };
  }

  /**
   * Rendu HTML standard d'un contrat type Cameroun — réutilisable côté front pour
   * pré-remplir le champ bodyHtml avant création. Clauses minimales (loi N°97/009
   * sur les baux à usage d'habitation), à adapter par le bailleur.
   */
  renderStandardBody(input: {
    bailleur: string;
    locataire: string;
    adresse: string;
    chambre: string;
    monthlyRent: number;
    deposit: number;
    startDate: string;
    durationMonths?: number | null;
    noticeDays: number;
  }): string {
    const fcfa = (n: number) => n.toLocaleString('fr-FR').replace(/\u00A0/g, ' ') + ' FCFA';
    const duree = input.durationMonths
      ? `${input.durationMonths} mois reconductibles`
      : 'durée indéterminée reconductible mensuellement';
    return `
<section class="contract">
  <h1>Contrat de bail à usage d'habitation</h1>
  <p>Entre les soussignés :</p>
  <p><strong>${input.bailleur}</strong>, propriétaire bailleur, d'une part,</p>
  <p>Et <strong>${input.locataire}</strong>, preneur, d'autre part,</p>
  <p>Il a été convenu et arrêté ce qui suit :</p>
  <h2>Article 1 — Objet</h2>
  <p>Le bailleur loue au preneur le logement <strong>${input.chambre}</strong> situé à ${input.adresse}, à usage exclusif d'habitation.</p>
  <h2>Article 2 — Durée</h2>
  <p>Le présent bail est consenti pour une ${duree}, à compter du <strong>${input.startDate}</strong>.</p>
  <h2>Article 3 — Loyer</h2>
  <p>Le loyer mensuel est fixé à <strong>${fcfa(input.monthlyRent)}</strong>, payable d'avance au plus tard le jour d'échéance convenu.</p>
  <h2>Article 4 — Caution</h2>
  <p>Une caution de <strong>${fcfa(input.deposit)}</strong> est versée au bailleur à titre de garantie, restituée à la sortie après état des lieux et déduction éventuelle des réparations locatives.</p>
  <h2>Article 5 — Préavis</h2>
  <p>Chaque partie peut mettre fin au présent contrat moyennant un préavis de <strong>${input.noticeDays} jours</strong>, notifié par écrit.</p>
  <h2>Article 6 — Obligations du preneur</h2>
  <p>Le preneur s'engage à occuper paisiblement les lieux, à acquitter son loyer et ses charges, à entretenir le logement en bon père de famille et à signaler sans délai tout désordre affectant les lieux.</p>
  <h2>Article 7 — Résiliation</h2>
  <p>Faute de paiement du loyer à l'échéance, le bail pourra être résilié de plein droit après mise en demeure restée sans effet.</p>
  <h2>Article 8 — Droit applicable</h2>
  <p>Le présent contrat est régi par la loi camerounaise, notamment la loi N°97/009 du 10 janvier 1997 fixant les règles applicables aux baux à usage d'habitation.</p>
  <p class="sign">Fait en deux exemplaires. Signature électronique du preneur enregistrée par Bailo.</p>
</section>
`.trim();
  }
}
