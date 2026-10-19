import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Currency } from '@prisma/client';
import {
  setExchangeRateDto,
  updateAccountCurrencyDto,
  type SetExchangeRateDto,
  type UpdateAccountCurrencyDto,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { CurrencyService } from './currency.service';

@ApiTags('currency')
@ApiBearerAuth()
@Controller('currency')
export class CurrencyController {
  constructor(private readonly service: CurrencyService) {}

  @Get('rates')
  list(@CurrentUser() ctx: RequestContext) {
    return this.service.list(ctx);
  }

  @Post('rates')
  @Roles('OWNER')
  setRate(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(setExchangeRateDto)) dto: SetExchangeRateDto,
  ) {
    return this.service.setRate(ctx, dto);
  }

  @Put('preferences')
  @Roles('OWNER')
  updatePref(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(updateAccountCurrencyDto)) dto: UpdateAccountCurrencyDto,
  ) {
    return this.service.updateAccountPreferences(ctx, dto);
  }

  @Get('convert')
  convert(
    @CurrentUser() ctx: RequestContext,
    @Query('amount') amount: string,
    @Query('to') to: Currency,
  ) {
    return this.service.convert(ctx.accountId, Number(amount), to);
  }
}
