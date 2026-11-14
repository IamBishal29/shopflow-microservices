/**
 * Common envelope for every ShopFlow event. Concrete events (e.g. order.created.v1)
 * are added in M2 and narrow `type` and `payload`.
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
