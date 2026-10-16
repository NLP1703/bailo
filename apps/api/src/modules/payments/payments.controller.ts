import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createPaymentDto,
  previewAllocationQuery,
  uuid,
  voidPaymentDto,
  type CreatePaymentDto,
  type PreviewAllocationQuery,
  type VoidPaymentDto,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { PaymentsService } from './payments.service';
import { ReceiptsService } from '../receipts/receipts.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly receipts: ReceiptsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Encaisser un paiement (idempotent, affectation auto ou manuelle)' })
  async record(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createPaymentDto)) dto: CreatePaymentDto,
  ) {
    return this.payments.record(ctx, dto);
  }

  @Get('preview')
  @ApiOperation({ summary: 'Aperçu de l’affectation avant validation' })
  async preview(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(previewAllocationQuery)) query: PreviewAllocationQuery,
  ) {
    return this.payments.preview(ctx, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’un paiement' })
  async get(@Param('id', new ZodValidationPipe(uuid)) id: string) {
    return this.payments.get(id);
  }

  @Post(':id/void')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Annuler un paiement (motif obligatoire — RG8)' })
  async void(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(voidPaymentDto)) dto: VoidPaymentDto,
  ) {
    return this.payments.void(ctx, id, dto);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Reçu PDF (repli HTML sans Chromium)' })
  async receipt(
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { doc, filename } = await this.receipts.renderPayment(id);
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(doc.buffer);
  }

  @Get(':id/wa-link')
  @ApiOperation({ summary: 'Lien WhatsApp pré-rempli pour envoyer le reçu (F6.4)' })
  async waLink(@Param('id', new ZodValidationPipe(uuid)) id: string) {
    return this.receipts.paymentWaLink(id);
  }
}
