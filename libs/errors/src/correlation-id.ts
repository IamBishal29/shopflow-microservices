import { randomUUID } from 'node:crypto';

/** Header that carries one request's ID across the gateway, services and events. */
export const CORRELATION_HEADER = 'x-correlation-id';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * The header is client input that ends up in logs, response bodies and Kafka events,
 * so only short, plain IDs are accepted (no spaces, markup or control characters).
 */
export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_CORRELATION_ID.test(value);
}

/** The caller's ID when it is safe, otherwise a fresh UUID: every request gets exactly one. */
export function correlationIdOrNew(value: unknown): string {
  return isValidCorrelationId(value) ? value : randomUUID();
}
