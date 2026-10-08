import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { updateAccountDto, type UpdateAccountDto } from '@citegest/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  @ApiOperation({ summary: 'Profil du compte (propriétaire)' })
  get() {
    return this.account.get();
  }

  @Patch()
  @Roles('OWNER')
  @ApiOperation({ summary: 'Modifier le profil : nom, logo, mentions des reçus (F1.5)' })
  update(@Body(new ZodValidationPipe(updateAccountDto)) dto: UpdateAccountDto) {
    return this.account.update(dto);
  }
}
