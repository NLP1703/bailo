import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

interface HealthCheck {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  version: string;
  checks: Record<string, { status: 'up' | 'down'; latencyMs?: number; message?: string }>;
}

const BOOT_AT = Date.now();

/**
 * Health & readiness endpoints — pas de dépendances externes supplémentaires
 * (évite d'importer @nestjs/terminus). Format compatible avec les sondes
 * Kubernetes/Docker standards.
 *
 *  - GET /health   : le process répond (liveness)
 *  - GET /ready    : les dépendances critiques (DB, Redis) sont joignables (readiness)
 */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  liveness(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor((Date.now() - BOOT_AT) / 1000) };
  }

  @Public()
  @Get('ready')
  async readiness(): Promise<HealthCheck> {
    const checks: HealthCheck['checks'] = {};

    // Postgres
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'up', latencyMs: Date.now() - dbStart };
    } catch (err) {
      checks.database = { status: 'down', message: (err as Error).message };
    }

    // Redis
    const client = this.redis.client();
    if (client) {
      const redisStart = Date.now();
      try {
        const pong = await client.ping();
        checks.redis =
          pong === 'PONG'
            ? { status: 'up', latencyMs: Date.now() - redisStart }
            : { status: 'down', message: `Réponse inattendue : ${pong}` };
      } catch (err) {
        checks.redis = { status: 'down', message: (err as Error).message };
      }
    } else {
      checks.redis = { status: 'down', message: 'Client non initialisé' };
    }

    const anyDown = Object.values(checks).some((c) => c.status === 'down');
    return {
      status: anyDown ? 'degraded' : 'ok',
      uptimeSeconds: Math.floor((Date.now() - BOOT_AT) / 1000),
      version: process.env.APP_VERSION ?? '0.1.0',
      checks,
    };
  }
}
