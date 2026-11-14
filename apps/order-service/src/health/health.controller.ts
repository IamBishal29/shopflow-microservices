import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  /**
   * Liveness: the process is up and serving HTTP. No dependency checks here, so a
   * Postgres outage never makes Kubernetes restart a healthy pod. A readiness check
   * that pings the database arrives with the Prisma issue.
   */
  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}
