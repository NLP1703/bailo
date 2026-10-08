import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './common/config/config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { TenancyMiddleware } from './common/tenancy/tenancy.middleware';
import { AuditModule } from './common/audit/audit.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
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
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { FilesModule } from './modules/files/files.module';
import { AccountModule } from './modules/account/account.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
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
    ExpensesModule,
    ReportsModule,
    SyncModule,
    JobsModule,
    FilesModule,
    AccountModule,
  ],
  providers: [
    // Ordre significatif : authentification d'abord, puis contrôle des rôles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Le middleware pose le contexte (accountId) avant tout guard/handler.
    consumer.apply(TenancyMiddleware).forRoutes('*');
  }
}
