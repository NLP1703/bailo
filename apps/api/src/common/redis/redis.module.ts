import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RateLimiterService } from './rate-limiter.service';

/** Module global : RedisService + RateLimiterService disponibles partout sans import. */
@Global()
@Module({
  providers: [RedisService, RateLimiterService],
  exports: [RedisService, RateLimiterService],
})
export class RedisModule {}
