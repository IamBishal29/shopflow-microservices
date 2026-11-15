import { Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation';

/** Injection token for the gateway's shared ioredis client. */
export const REDIS = Symbol('REDIS');

/** Upper bound for one Redis command; the gateway must never wait on Redis for long. */
const COMMAND_TIMEOUT_MS = 250;

@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): Redis => {
        const logger = new Logger('Redis');
        const redis = new Redis(config.get('REDIS_URL', { infer: true }), {
          // Fail fast instead of queueing while disconnected or retrying inside a request:
          // callers (the rate limiter) decide what an unavailable Redis means.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          commandTimeout: COMMAND_TIMEOUT_MS,
        });
        // ioredis keeps reconnecting in the background (backoff); log instead of crashing.
        redis.on('error', (error: Error) => logger.warn(`Redis unavailable: ${error.message}`));
        return redis;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Close the connection on SIGTERM so the process can exit cleanly. */
  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
