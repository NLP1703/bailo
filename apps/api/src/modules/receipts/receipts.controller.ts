import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuid } from '@bailo/shared';
import { Public } from '../../common/auth/public.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ReceiptsService, type ReceiptVerification } from './receipts.service';

@ApiTags('receipts')
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Public()
  @Get('verify/:id')
  @ApiOperation({
    summary: 'Vérification publique d’un reçu (QR) — authentique/non, n°, montant, date',
  })
  async verify(@Param('id', new ZodValidationPipe(uuid)) id: string): Promise<ReceiptVerification> {
    return this.receipts.verify(id);
  }
}
