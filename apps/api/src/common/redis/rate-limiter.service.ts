import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  resetAtMs: number;
}

/**
 * Rate-limiter à fenêtre fixe (INCR + EXPIRE au premier hit).
 * Repli in-memory si Redis est indisponible, pour que l'API reste utilisable en dev.
 * Pour un vrai rate-limiting distribué, un fallback in-memory n'offre PAS les mêmes
 * garanties — c'est acceptable en dev, mais en prod Redis DOIT être joignable.
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger('RateLimiter');
  private readonly memory = new Map<string, { count: number; expiresAtMs: number }>();

  constructor(private readonly redis: RedisService) {}

  /**
   * Incrémente le compteur de la clé et répond s'il reste des tentatives.
   * @param key identifiant d'application (`login:+237...`, `otp:...`)
   * @param max nombre maximum d'opérations autorisées dans la fenêtre
   * @param windowSec durée de la fenêtre en secondes
   */
  async hit(key: string, max: number, windowSec: number): Promise<RateLimitResult> {
    const client = this.redis.client();
    const nsKey = `rl:${key}`;

    if (client) {
      try {
        const [[, count], [, ttl]] = (await client
          .multi()
          .incr(nsKey)
          .expire(nsKey, windowSec, 'NX')
          .exec()) as [[Error | null, number], [Error | null, number]];
        const resetAtMs = Date.now() + Math.max(0, (ttl ?? windowSec)) * 1000;
        return { allowed: count <= max, count, resetAtMs };
      } catch (err) {
        this.logger.warn(`Redis hit a échoué, repli mémoire : ${(err as Error).message}`);
      }
    }

    return this.memoryHit(nsKey, max, windowSec);
  }

  /** Remet à zéro le compteur (appel après succès pour ne pas bloquer un utilisateur légitime). */
  async reset(key: string): Promise<void> {
    const client = this.redis.client();
    const nsKey = `rl:${key}`;
    if (client) {
      try {
        await client.del(nsKey);
        return;
      } catch {
        /* fall through to memory */
      }
    }
    this.memory.delete(nsKey);
  }

  private memoryHit(key: string, max: number, windowSec: number): RateLimitResult {
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.expiresAtMs < now) {
      const expiresAtMs = now + windowSec * 1000;
      this.memory.set(key, { count: 1, expiresAtMs });
      return { allowed: true, count: 1, resetAtMs: expiresAtMs };
    }
    entry.count += 1;
    return { allowed: entry.count <= max, count: entry.count, resetAtMs: entry.expiresAtMs };
  }
}
