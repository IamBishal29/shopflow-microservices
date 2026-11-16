import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '@shopflow/database';
import { KafkaModule } from '@shopflow/kafka';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * notification-service reacts to payment.succeeded.v1 / payment.failed.v1 and tells the
 * customer. Its only HTTP surface is health. It owns the `notifications` database: the
 * record of what was sent, and the dedupe key.
 * payment.*.v1 -> PaymentResultsConsumer -> NotificationsService -> row + NotificationSender
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
    // Readiness check runs against notification-service's own database.
    DatabaseModule.forRoot({ client: PrismaService }),
    HealthModule,
    NotificationsModule,
  ],
})
export class AppModule {}
