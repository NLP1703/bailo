import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { updateAccountDto, updatePlanDto, type UpdateAccountDto, type UpdatePlanDto } from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AllowWhenReadOnly } from '../../common/auth/allow-read-only.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { BillingService } from '../../common/billing/billing.service';
import type { RequestContext } from '../../common/tenancy/request-context';
import { AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly billing: BillingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Profil du compte (propriétaire)' })
  get() {
    return this.account.get();
  }

  @Get('billing')
  @ApiOperation({ summary: 'Offre, limites, usage et état (lecture seule) du compte (M9)' })
  billing_(@CurrentUser() ctx: RequestContext) {
    return this.billing.summary(ctx.accountId);
  }

  @Patch('plan')
  @Roles('OWNER')
  @AllowWhenReadOnly()
  @ApiOperation({ summary: 'Changer d’offre (paiement Mobile Money en V2)' })
  changePlan(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(updatePlanDto)) dto: UpdatePlanDto,
  ) {
    return this.billing.changePlan(ctx.accountId, dto.plan);
  }

  @Patch()
  @Roles('OWNER')
  @ApiOperation({ summary: 'Modifier le profil : nom, logo, mentions des reçus (F1.5)' })
  update(@Body(new ZodValidationPipe(updateAccountDto)) dto: UpdateAccountDto) {
    return this.account.update(dto);
  }

  @Delete()
  @Roles('OWNER')
  @AllowWhenReadOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer définitivement son compte et toutes ses données' })
  async remove(): Promise<void> {
    await this.account.deleteOwn();
  }
}
