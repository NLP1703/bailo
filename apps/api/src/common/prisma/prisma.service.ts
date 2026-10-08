import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { accountScopeMiddleware } from './account-scope';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { level: 'warn', emit: 'stdout' },
              { level: 'error', emit: 'stdout' },
            ]
          : [{ level: 'error', emit: 'stdout' }],
    });
    // Filtrage systématique par compte (NF7) — cf. account-scope.ts.
    this.$use(accountScopeMiddleware());
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connexion PostgreSQL établie');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
