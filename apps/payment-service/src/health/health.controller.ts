import { Controller, Get, UseFilters } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from '@shopflow/database';
import { HealthCheckErrorFilter } from './health-check-error.filter';

@Controller('health')
@UseFilters(HealthCheckErrorFilter)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  /**
   * Liveness: the process is up and serving HTTP. No dependency checks, so a Postgres
   * outage never makes Kubernetes restart a healthy pod.
   */
  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  /** Readiness: can this instance serve traffic? 503 while the database is unreachable. */
  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.pingCheck('database')]);
  }
}
