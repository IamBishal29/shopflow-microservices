# ShopFlow: Product Requirements

## Problem

Interviewers for Node.js backend roles ask how you build reliable distributed systems:
how a service publishes events without losing them, how consumers handle duplicates, how a
multi-service workflow completes or compensates without distributed transactions, and how
you observe it all. ShopFlow is a small but realistic e-commerce backend that answers those
questions with running code, so every answer can end with "here, I'll show you".

## Users and flows

**Shopper** (via REST through the api-gateway):

1. **Place order**: `POST /orders` with items and an `Idempotency-Key` header. The gateway
   authenticates the JWT, rate-limits, adds a correlation ID and forwards to order-service.
   order-service stores the order as `PENDING` and, in the same DB transaction, writes an
   `order.created.v1` event to its outbox. Response: `201` with the order.
2. **Pay**: payment-service consumes `order.created.v1`, simulates a charge (deterministic
   rules, e.g. total above a threshold fails) and publishes `payment.succeeded.v1` or
   `payment.failed.v1`. No real payment provider and no card data, ever.
3. **Complete**: order-service consumes the payment result and moves the order to `PAID` or
   `PAYMENT_FAILED`. The shopper polls `GET /orders/:id` to see the final status.
4. **Notify**: notification-service consumes the payment result and logs or sends a
   notification ("Your order #123 is confirmed").

**Operator**: checks health endpoints, reads JSON logs by correlation ID, inspects Kafka
topics and the dead-letter topic in Kafka UI, follows a trace in Jaeger.

## Functional scope

- Orders: create, get by id, list (paged), with validated DTOs and Swagger docs.
- Event flow: outbox relay to Kafka, idempotent consumers, choreography saga with two outcomes.
- Edge: JWT auth (local issuer for the demo), routing, rate limiting, response cache for
  `GET /orders/:id`, idempotency keys for `POST /orders`.
- Operations: liveness/readiness, structured logs, distributed tracing.

## Non-functional goals

| Goal          | How we meet it                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Reliability   | Transactional outbox (no lost events); at-least-once delivery; retries with backoff, then a dead-letter topic |
| Idempotency   | Consumers record processed `eventId`s; gateway idempotency keys in Redis for `POST /orders`                   |
| Ordering      | Kafka key = `orderId`, so all events for one order land in one partition                                      |
| Isolation     | Database per service; no synchronous calls inside the saga                                                    |
| Observability | pino JSON logs with correlation ID; OpenTelemetry traces in Jaeger; Terminus health checks                    |
| Operability   | Graceful shutdown; 12-factor config validated at startup; runs with one `docker compose up`, then on kind     |
| Quality       | Strict TypeScript, lint with zero warnings, unit, integration (Testcontainers) and e2e tests in CI            |

## Out of scope

Real payments or card data, inventory/stock reservation, product catalogue, carts, refunds,
a UI, multi-region deployment, a production identity provider, paid cloud services.

## Success criteria

- `docker compose up` then one `curl` sequence demonstrates both saga outcomes end to end.
- Killing a service mid-flow loses no orders; restarting it completes the flow (demo-able).
- Replaying a Kafka message does not double-charge or double-notify (demo-able).
- A poison message ends up in the dead-letter topic, visible in Kafka UI.
- One correlation ID finds every log line and the full trace for an order.
- CI is green on every PR; each milestone has a learning note with interview Q&A.
