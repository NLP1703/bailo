import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { MaintenanceService } from './maintenance.service';

const QUEUE_NAME = 'maintenance';
const JOB_NAME = 'daily';

function parseRedis(url: string): {
  host: string;
  port: number;
  password?: string;
  username?: string;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: u.password } : {}),
    ...(u.username ? { username: u.username } : {}),
  };
}

/**
 * Planifie la maintenance quotidienne (BullMQ). Désactivé par défaut (`ENABLE_JOBS=false`)
 * pour que l'API démarre sans Redis en dev ; activé en production.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Jobs');
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly maintenance: MaintenanceService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.env.ENABLE_JOBS) {
      this.logger.log('Jobs désactivés (ENABLE_JOBS=false)');
      return;
    }
    const connection = parseRedis(this.env.REDIS_URL);

    this.worker = new Worker(QUEUE_NAME, async () => this.maintenance.run(), { connection });
    this.worker.on('failed', (_job, err) => this.logger.error(`Job échoué: ${err.message}`));

    this.queue = new Queue(QUEUE_NAME, { connection });
    await this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { pattern: this.env.JOBS_CRON, tz: this.env.TZ },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    this.logger.log(`Maintenance planifiée (${this.env.JOBS_CRON}, ${this.env.TZ})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
