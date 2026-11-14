import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { DATABASE, SqlClient } from './sql-client';

const PING_TIMEOUT_MS = 1000;

/**
 * Readiness check for Postgres: `SELECT 1` with a timeout. Written by hand because
 * Terminus' PrismaHealthIndicator first tries a MongoDB command and relies on matching
 * Prisma's error text to fall back to SQL, which is brittle across Prisma upgrades.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Inject(DATABASE) private readonly db: SqlClient,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const check = this.indicator.check(key);
    try {
      await withTimeout(this.db.$queryRaw`SELECT 1`, PING_TIMEOUT_MS);
      return check.up();
    } catch (error) {
      return check.down({ message: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
