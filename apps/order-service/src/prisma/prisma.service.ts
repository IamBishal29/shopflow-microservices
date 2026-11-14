import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { EnvironmentVariables } from '../config/env.validation';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
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

  /** Close the pool on SIGTERM (enableShutdownHooks) so connections are not leaked. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
