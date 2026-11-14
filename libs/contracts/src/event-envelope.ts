import { z } from 'zod';

/**
 * Common envelope for every ShopFlow event. Concrete events narrow `type` and `payload`.
 * Kept as a plain interface so producers can build events without importing zod.
 */
export interface EventEnvelope<TType extends string, TPayload> {
  /** Unique per event; consumers store it to stay idempotent. */
  readonly eventId: string;
  /** Versioned event name, e.g. "order.created.v1". */
  readonly type: TType;
  /** ISO-8601 timestamp of when the fact happened. */
  readonly occurredAt: string;
  /** Carries the request's correlation ID across services for tracing logs. */
  readonly correlationId: string;
  readonly payload: TPayload;
}

/**
 * Builds the runtime schema for one event type. Unknown fields are stripped, not rejected
 * (tolerant reader): a producer may add an optional field to v1 without breaking consumers.
 */
export function envelopeSchema<TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) {
  return z.object({
    eventId: z.uuid(),
    type: z.literal(type),
    occurredAt: z.iso.datetime({ offset: true }),
    correlationId: z.string().min(1).max(128),
    payload,
  });
}

/** Shared field rules. Shape only; business limits stay in the producing service. */
export const fields = {
  orderId: z.uuid(),
  cents: z.int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code'),
} as const;
