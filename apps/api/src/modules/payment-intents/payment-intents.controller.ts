import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Query,
  Get,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  createPaymentIntentDto,
  paymentIntentListQuery,
  type CreatePaymentIntentDto,
  type PaymentIntentListQuery,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentProviderRegistry } from './providers/provider.registry';

@ApiTags('payment-intents')
@ApiBearerAuth()
@Controller('payment-intents')
export class PaymentIntentsController {
  constructor(
    private readonly service: PaymentIntentsService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  @Post()
  @Roles('OWNER', 'MANAGER', 'CARETAKER')
  @ApiOperation({ summary: 'Déclencher un paiement Mobile Money (MoMo / OM Collect)' })
  async create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createPaymentIntentDto)) dto: CreatePaymentIntentDto,
  ) {
    return this.service.create(ctx, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Liste des intents (dernières demandes)' })
  async list(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(paymentIntentListQuery)) q: PaymentIntentListQuery,
  ) {
    return this.service.list(ctx, q);
  }

  /**
   * Webhook public (non authentifié) — le provider pousse ici après confirmation
   * ou échec de l'ordre. Signature HMAC vérifiée par le provider avant tout traitement.
   */
  @Public()
  @Post('webhook/:provider')
  @ApiOperation({ summary: 'Webhook provider (interne)' })
  async webhook(
    @Param('provider') providerName: string,
    @Headers() headers: Record<string, string>,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const upper = providerName.toUpperCase();
    if (!['MTN_MOMO', 'ORANGE_MONEY', 'MOCK'].includes(upper)) {
      throw new BadRequestException('Provider inconnu');
    }
    const provider = this.registry.get(upper as any);
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);
    const event = provider.parseWebhook(headers, raw);
    if (!event) throw new BadRequestException('Signature invalide ou payload illisible');
    await this.service.handleWebhook(upper, {
      providerRef: event.providerRef,
      status: event.status,
      statusMessage: event.statusMessage,
      rawPayload: event.rawPayload as Record<string, unknown> | undefined,
    });
    return { ok: true };
  }
}
