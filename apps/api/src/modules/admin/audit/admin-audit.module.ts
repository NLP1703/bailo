import { Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';

/**
 * Sous-module « Journal d'audit » du périmètre Admin (Lot 3).
 * Lecture seule. SiteAccessService (TenancyModule, global) et PrismaService
 * (PrismaModule, global) sont injectés automatiquement.
 */
@Module({
  controllers: [AdminAuditController],
  providers: [AdminAuditService],
  exports: [AdminAuditService],
})
export class AdminAuditModule {}
