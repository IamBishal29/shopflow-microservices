import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '@shopflow/database';
import { KafkaModule } from '@shopflow/kafka';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * payment-service reacts to events; its only HTTP surface is health. The consumer, the
 * PaymentsService and the outbox relay are added in #10.
 */
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
    // Readiness check (and later the outbox relay) run against payments' own database.
    DatabaseModule.forRoot({ client: PrismaService }),
    HealthModule,
  ],
})
export class AppModule {}
