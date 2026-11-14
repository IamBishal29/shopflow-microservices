import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { KafkaModule } from '@shopflow/kafka';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Real environment variables win over .env, so containers/K8s override local files.
      validate: validateEnv,
    }),
    KafkaModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        brokers: config.get('KAFKA_BROKERS', { infer: true }),
        clientId: config.get('KAFKA_CLIENT_ID', { infer: true }),
      }),
    }),
    PrismaModule,
    HealthModule,
    OrdersModule,
  ],
  providers: [
    // One global mapping from errors to RFC 9457 responses (see docs/learning/04).
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Registered through DI (not app.useGlobalPipes in main.ts) so e2e test apps built
    // from AppModule validate exactly like production.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true, // strip properties without decorators...
        forbidNonWhitelisted: true, // ...and reject the request instead (mass assignment)
        transform: true, // plain JSON -> DTO instances, query strings -> numbers
      }),
    },
  ],
})
export class AppModule {}
