import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { EnvironmentVariables } from '../config/env.validation';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('ORDER_DATABASE_URL', { infer: true }),
      }),
    });
  }

  /**
   * Warm the pool at startup, but do not crash if Postgres is down: the process stays
   * alive (liveness ok) and /health/ready reports the outage, so Kubernetes stops
   * routing traffic instead of restart-looping the pod. Prisma reconnects on next query.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Database not reachable at startup; will retry on demand: ${reason}`);
    }
  }

  /**
   * Close the pool on SIGTERM (enableShutdownHooks). Runs in the last shutdown phase, after
   * Kafka consumers stopped in onModuleDestroy, so in-flight handlers can still use the DB.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
