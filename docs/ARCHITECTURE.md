# ShopFlow Architecture

## Services and data stores

```mermaid
flowchart LR
  client([Client]) -->|REST + JWT| gw[api-gateway]
  gw -->|REST| os[order-service]
  gw <--> redis[(Redis<br/>cache, rate limit,<br/>idempotency keys)]
  os --> odb[(Postgres<br/>orders db<br/>orders, outbox,<br/>processed_events)]
  os -->|outbox relay| k{{Kafka KRaft}}
  k --> ps[payment-service]
  ps --> pdb[(Postgres<br/>payments db)]
  ps --> k
  k --> os
  k --> ns[notification-service]
  ns --> ndb[(Postgres<br/>notifications db)]
```

Each service owns its database (database-per-service). Locally they are separate databases
in one Postgres container; nothing reads another service's tables. Services talk to each
other only through Kafka events defined in `libs/contracts`.

## Saga: happy path

```mermaid
sequenceDiagram
  participant C as Client
  participant G as api-gateway
  participant O as order-service
  participant K as Kafka
  participant P as payment-service
  participant N as notification-service
  C->>G: POST /orders (JWT, Idempotency-Key)
  G->>O: POST /orders (x-correlation-id)
  O->>O: TX: insert order PENDING + outbox row
  O-->>G: 201 order
  G-->>C: 201 order
  O->>K: relay publishes order.created.v1 (key=orderId)
  K->>P: order.created.v1
  P->>P: TX: record eventId, simulate charge, outbox row
  P->>K: payment.succeeded.v1
  K->>O: payment.succeeded.v1
  O->>O: TX: record eventId, order -> PAID
  K->>N: payment.succeeded.v1
  N->>N: record eventId, send "order confirmed"
  C->>G: GET /orders/:id
  G-->>C: status PAID
```

## Saga: payment failure

```mermaid
sequenceDiagram
  participant O as order-service
  participant K as Kafka
  participant P as payment-service
  participant N as notification-service
  O->>K: order.created.v1
  K->>P: order.created.v1
  P->>P: simulated charge declined
  P->>K: payment.failed.v1 (reason)
  K->>O: payment.failed.v1
  O->>O: order -> PAYMENT_FAILED (compensation)
  K->>N: payment.failed.v1
  N->>N: send "payment failed"
  Note over P,K: Technical errors (not declines) retry with backoff,<br/>then go to the topic's .dlq
```

A declined payment is a business outcome and becomes an event. A crash or bug is a
technical failure: it is retried and, if it keeps failing, parked in the dead-letter topic.

## Kafka topics

| Topic                  | Key          | Producer                  | Consumers                           | Payload version |
| ---------------------- | ------------ | ------------------------- | ----------------------------------- | --------------- |
| `order.created.v1`     | `orderId`    | order-service (outbox)    | payment-service                     | v1              |
| `payment.succeeded.v1` | `orderId`    | payment-service (outbox)  | order-service, notification-service | v1              |
| `payment.failed.v1`    | `orderId`    | payment-service (outbox)  | order-service, notification-service | v1              |
| `<topic>.dlq`          | original key | the consumer that gave up | operator (Kafka UI)                 | same as source  |

Every message uses the envelope in `libs/contracts`: `eventId`, `type`, `occurredAt`,
`correlationId`, `payload`. Breaking changes create a new versioned topic (`.v2`) and run
both side by side during migration.

Payloads (zod schemas and fixtures in `libs/contracts/src`; consumers call `parseEvent`):

- `order.created.v1`: `orderId`, `customerId`, `totalCents`, `currency`,
  `items[{ sku, quantity, unitPriceCents }]`
- `payment.succeeded.v1`: `orderId`, `paymentId`, `amountCents`, `currency`
- `payment.failed.v1`: `orderId`, `reason`, `amountCents`, `currency`

## Order status

`PENDING` -> `PAID` or `PAYMENT_FAILED`. Transitions only from `PENDING`; a duplicate or
late event for a finished order is ignored and logged.

## Key decisions

See [decisions](decisions): stack (0001), KafkaJS directly (0002), NestJS gateway (0003),
kind (0004), Nest CLI monorepo (0005).
