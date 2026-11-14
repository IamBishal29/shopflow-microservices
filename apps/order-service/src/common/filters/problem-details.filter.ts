import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PROBLEM_CONTENT_TYPE, toProblem } from './problem-details';

const CORRELATION_HEADER = 'x-correlation-id';
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * The single place where errors become HTTP responses (RFC 9457 problem+json).
 * Unknown errors are logged with their stack here and answered with a bare 500.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const correlationId = request.header(CORRELATION_HEADER);
    const problem = {
      ...toProblem(exception),
      instance: request.originalUrl,
      timestamp: new Date().toISOString(),
      // Echo only well-formed IDs: the header is client input and ends up in our body.
      ...(correlationId && SAFE_CORRELATION_ID.test(correlationId) ? { correlationId } : {}),
    };

    if (problem.status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${request.method} ${request.originalUrl} failed`, stack);
    }

    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }
}
