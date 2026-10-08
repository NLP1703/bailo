import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { JobsService } from './jobs.service';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [RemindersModule],
  providers: [MaintenanceService, JobsService],
  exports: [MaintenanceService],
})
export class JobsModule {}
