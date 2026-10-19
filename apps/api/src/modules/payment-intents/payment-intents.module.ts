import { Module } from '@nestjs/common';
import { PaymentIntentsController } from './payment-intents.controller';
import { PaymentIntentsService } from './payment-intents.service';
import { MockCollectProvider } from './providers/mock.provider';
import { PaymentProviderRegistry } from './providers/provider.registry';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [PaymentIntentsController],
  providers: [PaymentIntentsService, MockCollectProvider, PaymentProviderRegistry],
})
export class PaymentIntentsModule {}
