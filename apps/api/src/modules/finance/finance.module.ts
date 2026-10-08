import { Global, Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { ReceiptNumberService } from './receipt-number.service';

/** Services financiers transverses (soldes dérivés, numérotation des reçus). */
@Global()
@Module({
  providers: [BalanceService, ReceiptNumberService],
  exports: [BalanceService, ReceiptNumberService],
})
export class FinanceModule {}
