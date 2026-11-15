import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ProblemDetailsFilter } from '@shopflow/errors';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';

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
    HealthModule,
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
export class AppModule {}
