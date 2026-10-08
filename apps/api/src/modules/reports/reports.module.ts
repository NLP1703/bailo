import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ExportsService } from './exports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ExportsService],
})
export class ReportsModule {}
