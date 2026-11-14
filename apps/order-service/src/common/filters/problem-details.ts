import { STATUS_CODES } from 'node:http';
import { HttpException, HttpStatus } from '@nestjs/common';
import { DomainError, DomainErrorKind } from '../errors/domain-error';

/** RFC 9457 problem details plus ShopFlow extension members (code, timestamp, ...). */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly code: string;
  readonly timestamp?: string;
  readonly correlationId?: string;
  /** Validation messages, only for VALIDATION_FAILED. */
  readonly errors?: readonly string[];
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const KIND_STATUS: Readonly<Record<DomainErrorKind, number>> = {
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  rule_violation: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Maps anything thrown by a handler to a problem. Never exposes details of 5xx errors. */
export function toProblem(exception: unknown): ProblemDetails {
  if (exception instanceof DomainError) {
    return {
      type: `urn:shopflow:problem:${toSlug(exception.code)}`,
      title: exception.title,
      status: KIND_STATUS[exception.kind],
      detail: exception.message,
      code: exception.code,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const message = isRecord(body) ? body.message : body;
    if (status === 400 && Array.isArray(message)) {
      return {
        type: 'urn:shopflow:problem:validation-failed',
        title: 'Request validation failed',
        status,
        detail: 'One or more fields are invalid.',
        code: 'VALIDATION_FAILED',
        errors: message.filter((m): m is string => typeof m === 'string'),
      };
    }
    return httpProblem(status, typeof message === 'string' ? message : exception.message);
  }

  // Errors from Express middleware (e.g. malformed JSON) follow the http-errors convention:
  // `expose: true` marks a client error whose message is safe to show.
  if (isRecord(exception) && exception.expose === true && typeof exception.status === 'number') {
    const message = typeof exception.message === 'string' ? exception.message : undefined;
    return httpProblem(exception.status, message);
  }

  return httpProblem(HttpStatus.INTERNAL_SERVER_ERROR, undefined);
}

function httpProblem(status: number, detail: string | undefined): ProblemDetails {
  const title = STATUS_CODES[status] ?? 'Error';
  return {
    type: 'about:blank',
    title,
    status,
    ...(status < 500 && detail ? { detail } : {}),
    code: title.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
  };
}

function toSlug(code: string): string {
  return code.toLowerCase().replace(/_/g, '-');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
