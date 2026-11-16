import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorage } from '@nestjs/throttler';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { REDIS } from '../src/redis/redis.module';

/**
 * Stand-in for ioredis: every command fails, so the rate limiter fails open and e2e tests
 * never need a Redis server. Rate-limit e2e tests swap the storage instead.
 */
export const redisStub = () => ({
  eval: () => Promise.reject(new Error('redis stub: not connected')),
  disconnect: () => undefined,
});

export const TEST_JWT = {
  secret: 'e2e-gateway-secret-at-least-32-chars',
  issuer: 'shopflow-gateway',
  audience: 'shopflow-api',
} as const;

/**
 * Boots the real gateway with its config replaced by a plain stand-in. (A real
 * ConfigService would prefer process.env, which setup-env.ts has already filled.)
 */
export async function createGateway(
  overrides: Readonly<Record<string, unknown>>,
  options: { readonly storage?: ThrottlerStorage; readonly redis?: object } = {},
): Promise<INestApplication<App>> {
  const values: Readonly<Record<string, unknown>> = {
    NODE_ENV: 'development',
    ORDER_SERVICE_URL: 'http://127.0.0.1:1',
    DOWNSTREAM_TIMEOUT_MS: 200,
    JWT_SECRET: TEST_JWT.secret,
    JWT_ISSUER: TEST_JWT.issuer,
    JWT_AUDIENCE: TEST_JWT.audience,
    JWT_TTL_SECONDS: 900,
    REDIS_URL: 'redis://127.0.0.1:1',
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_WINDOW_SECONDS: 60,
    IDEMPOTENCY_TTL_SECONDS: 86_400,
    ORDER_CACHE_TTL_SECONDS: 5,
    ...overrides,
  };
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: (key: string) => values[key] })
    .overrideProvider(REDIS)
    .useValue(options.redis ?? redisStub());
  if (options.storage) {
    builder = builder.overrideProvider(getStorageToken()).useValue(options.storage);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

/** Signs with the app's own JwtService (module defaults), optionally overriding claims. */
export function tokenFor(
  app: INestApplication<App>,
  sub = 'c-42',
  options: JwtSignOptions = {},
): string {
  return app.get(JwtService).sign({ sub }, options);
}
