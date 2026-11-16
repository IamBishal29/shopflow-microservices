import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@shopflow/database';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * notification-service reacts to payment.succeeded.v1 / payment.failed.v1 (consumer in
 * #14) and tells the customer. Its only HTTP surface is health. It owns the
 * `notifications` database: the record of what was sent, and the dedupe key.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Real environment variables win over .env, so containers/K8s override local files.
      validate: validateEnv,
    }),
    PrismaModule,
    // Readiness check runs against notification-service's own database.
    DatabaseModule.forRoot({ client: PrismaService }),
    HealthModule,
  ],
})
export class AppModule {}
