import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminAuditModule } from './audit/admin-audit.module';
import { AdminAccountModule } from './account/admin-account.module';

/**
 * Module ombrelle du périmètre /admin — regroupe au fil des lots :
 *  - Lot 0 : vue d'ensemble (ce fichier)
 *  - Lot 2 : équipe & sessions
 *  - Lot 3 : journal d'audit
 *  - Lot 4 : paramètres du compte
 *  - Lot 5 : abonnement & quotas
 *  - Lot 6 : intégrations & canaux
 *  - Lot 7 : exports, imports, corbeille, anomalies
 *
 * Les guards (@Roles, SubscriptionGuard, JwtAuthGuard) et le service d'audit
 * (common/audit/audit.service.ts) sont déjà globaux dans AppModule — rien à
 * ré-enregistrer ici.
 */
@Module({
  imports: [AdminUsersModule, AdminAuditModule, AdminAccountModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
