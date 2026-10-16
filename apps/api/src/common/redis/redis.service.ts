import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import IORedis, { type Redis } from 'ioredis';
import { APP_ENV, type AppEnv } from '../config/env';

/**
 * Connexion Redis partagée (rate-limiting, cache, idempotence hors BullMQ).
 * Si l'URL est injoignable, `client()` renvoie null et les consommateurs doivent
 * gérer un repli (ex. in-memory). On ne fait **pas** planter l'API : le projet
 * doit pouvoir démarrer en dev sans Redis.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  private _client: Redis | null = null;
  private _unavailable = false;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  client(): Redis | null {
    if (this._unavailable) return null;
    if (this._client) return this._client;
    try {
      this._client = new IORedis(this.env.REDIS_URL, {
        lazyConnect: false,
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        reconnectOnError: () => true,
      });
      this._client.on('error', (err) => {
        if (!this._unavailable) {
          this._unavailable = true;
          this.logger.warn(`Redis indisponible, bascule sur repli mémoire : ${err.message}`);
        }
      });
      this._client.on('ready', () => {
        this._unavailable = false;
        this.logger.log('Redis connecté');
      });
      return this._client;
    } catch (err) {
      this._unavailable = true;
      this.logger.warn(`Impossible d'initialiser Redis : ${(err as Error).message}`);
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this._client) {
      try {
        await this._client.quit();
      } catch {
        this._client.disconnect();
      }
    }
  }
}
