import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './common/config/config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { TenancyMiddleware } from './common/tenancy/tenancy.middleware';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { HttpLoggerMiddleware } from './common/http/http-logger.middleware';
import { AuditModule } from './common/audit/audit.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { SubscriptionGuard } from './common/auth/subscription.guard';
import { BillingModule } from './common/billing/billing.module';
import { SmsModule } from './modules/sms/sms.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { FinanceModule } from './modules/finance/finance.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SitesModule } from './modules/sites/sites.module';
import { UnitsModule } from './modules/units/units.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { OccupanciesModule } from './modules/occupancies/occupancies.module';
import { ChargesModule } from './modules/charges/charges.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { CashModule } from './modules/cash/cash.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { FilesModule } from './modules/files/files.module';
import { AccountModule } from './modules/account/account.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    BillingModule,
    TenancyModule,
    AuditModule,
    SmsModule,
    PdfModule,
    FinanceModule,
    AuthModule,
    UsersModule,
    SitesModule,
    UnitsModule,
    TenantsModule,
    OccupanciesModule,
    ChargesModule,
    PaymentsModule,
    ReceiptsModule,
    CashModule,
    TemplatesModule,
    RemindersModule,
    ReportsModule,
    SyncModule,
    JobsModule,
    FilesModule,
    AccountModule,
    HealthModule,
  ],
  providers: [
    // Ordre significatif : authentification, rôles, puis état d'abonnement.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Ordre : requestId → logger → tenancy. Le logger a besoin de l'id, le reste n'en a pas.
    consumer.apply(RequestIdMiddleware, HttpLoggerMiddleware).forRoutes('*');
    consumer.apply(TenancyMiddleware).forRoutes('*');
  }
}
