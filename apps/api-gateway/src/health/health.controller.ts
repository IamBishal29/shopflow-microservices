import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';

// Probes carry no credentials; health reveals nothing sensitive.
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  /** Liveness: the process is up and serving HTTP. */
  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  /**
   * Readiness: can this instance accept traffic? Deliberately does NOT call order-service.
   * The gateway is stateless; tying its readiness to a downstream would pull every gateway
   * pod out of the load balancer when one service hiccups, taking down healthy routes too
   * (a cascading outage). A down downstream is reported per request instead (502/504, #15).
   */
  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}
