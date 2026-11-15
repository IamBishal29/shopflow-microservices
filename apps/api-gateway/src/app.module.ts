import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ProblemDetailsFilter } from '@shopflow/errors';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { CorrelationIdMiddleware } from './correlation/correlation-id.middleware';
import { HealthModule } from './health/health.module';
import { ProxyModule } from './proxy/proxy.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';

/**
 * The single entry point for clients. Owns edge concerns only (routing, correlation ID,
 * timeouts; later JWT, rate limiting, caching); business rules stay in the services.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Real environment variables win over .env, so containers/K8s override local files.
      validate: validateEnv,
    }),
    // Order matters: guards run in registration order (auth first, then rate limit by user).
    AuthModule,
    RateLimitModule,
    HealthModule,
    ProxyModule,
  ],
  providers: [
    // Same RFC 9457 body as every ShopFlow service, so clients parse one error format.
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every path, including health and unknown routes, so every response carries the ID.
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*path}');
  }
}
