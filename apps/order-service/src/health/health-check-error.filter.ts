import { ArgumentsHost, Catch, ExceptionFilter, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Health endpoints keep Terminus' own report format on 503 (which check is down and why),
 * because probes and monitoring tools expect it. Controller-scoped, so it runs before the
 * global problem-details filter.
 */
@Catch(ServiceUnavailableException)
export class HealthCheckErrorFilter implements ExceptionFilter {
  catch(exception: ServiceUnavailableException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(exception.getStatus())
      .json(exception.getResponse());
  }
}
