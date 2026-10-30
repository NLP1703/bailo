import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { ImportService } from './import.service';
import { OccupanciesModule } from '../occupancies/occupancies.module';

@Module({
  imports: [OccupanciesModule],
  controllers: [TenantsController],
  providers: [TenantsService, ImportService],
  exports: [TenantsService],
})
export class TenantsModule {}
