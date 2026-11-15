import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation';
import { REDIS, RedisModule } from '../redis/redis.module';
import { GatewayThrottlerGuard } from './gateway-throttler.guard';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, REDIS],
      useFactory: (config: ConfigService<EnvironmentVariables, true>, redis: Redis) => ({
        throttlers: [
          {
            name: 'default',
            limit: config.get('RATE_LIMIT_MAX', { infer: true }),
            ttl: config.get('RATE_LIMIT_WINDOW_SECONDS', { infer: true }) * 1000,
          },
        ],
        storage: new RedisThrottlerStorage(redis),
        errorMessage: 'Rate limit exceeded. Retry after the number of seconds in Retry-After.',
      }),
    }),
  ],
  providers: [
    // Registered after AuthModule's guard, so it runs second and sees the verified user.
    { provide: APP_GUARD, useClass: GatewayThrottlerGuard },
  ],
})
export class RateLimitModule {}
