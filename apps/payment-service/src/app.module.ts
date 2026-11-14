import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '@shopflow/database';
import { KafkaModule } from '@shopflow/kafka';
import { OutboxModule } from '@shopflow/outbox';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * payment-service reacts to events; its only HTTP surface is health.
 * order.created.v1 -> PaymentsService -> payments + outbox rows -> relay -> payment.*.v1
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
    // Readiness check and outbox relay run against payments' own database.
    DatabaseModule.forRoot({ client: PrismaService }),
    OutboxModule,
    HealthModule,
    PaymentsModule,
  ],
})
export class AppModule {}
