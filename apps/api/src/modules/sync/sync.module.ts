import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { PaymentsModule } from '../payments/payments.module';
import { MetersModule } from '../meters/meters.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { CashModule } from '../cash/cash.module';
import { DevicesModule } from '../devices/devices.module';
import { TenantsModule } from '../tenants/tenants.module';
import { OccupanciesModule } from '../occupancies/occupancies.module';

@Module({
  imports: [
    PaymentsModule,
    MetersModule,
    MaintenanceModule,
    ExpensesModule,
    CashModule,
    DevicesModule,
    TenantsModule,
    OccupanciesModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
