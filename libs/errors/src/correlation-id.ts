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
