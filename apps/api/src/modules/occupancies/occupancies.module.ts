import { Module } from '@nestjs/common';
import { OccupanciesController } from './occupancies.controller';
import { OccupanciesService } from './occupancies.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [OccupanciesController],
  providers: [OccupanciesService],
  exports: [OccupanciesService],
})
export class OccupanciesModule {}
