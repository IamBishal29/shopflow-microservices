# ShopFlow: interview guide

How to present ShopFlow, where each pattern lives in the code, and short answers to the
questions it invites. Everything marked **built** runs and was verified live; **planned**
items are honest gaps with an issue number.

## The 2-minute walkthrough

1. **What it is.** A small e-commerce backend: place an order, pay (simulated), get notified.
   Four NestJS services in a TypeScript monorepo; three are built (gateway, orders,
   payments).
2. **The edge.** Clients only talk to `api-gateway`. It verifies JWTs, rate-limits per user
   in Redis, makes `POST /orders` safe to retry with idempotency keys, gives every request
   a correlation ID and puts a 3 s timeout on every downstream call.
3. **Writing an order.** order-service saves the order _and_ an `order.created.v1` event row
   in one Postgres transaction (transactional outbox). A relay publishes the row to Kafka,
   keyed by `orderId`, so a Kafka outage never loses an order.
4. **The saga.** payment-service consumes the event, simulates the charge and publishes
   `payment.succeeded` or `payment.failed` (again via its own outbox). order-service consumes
   the result and moves the order `PENDING → PAID | PAYMENT_FAILED`. This is choreography:
   no orchestrator and no synchronous calls between services.
5. **Reliability.** Delivery is at-least-once, so every consumer is idempotent (a
   `processed_events` table written in the same transaction). Technical failures go to a
   retry topic with backoff, then to a dead-letter topic; poison messages go straight to the
   DLQ. Each service owns its database.
6. **Proof.** Unit + e2e tests in CI; failure demos in the README (Kafka down, consumer down,
   poison message, gateway 401/429/502/503).

## Pattern map

| Pattern                          | Where (built)                                    | Why                                                     | Trade-off                                                                  |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| API gateway                      | `apps/api-gateway`                               | one door for auth, limits, routing                      | extra hop; can become a bottleneck or a distributed monolith               |
| JWT auth (HS256, pinned)         | `api-gateway/src/auth`                           | stateless, any replica verifies                         | hard to revoke → short TTL                                                 |
| Object-level authorization       | order-service `WHERE id = ? AND customer_id = ?` | stop BOLA: ids are not secrets                          | trusts the gateway's `x-customer-id`; 404 hides existence                  |
| Rate limiting (Redis, Lua)       | `api-gateway/src/rate-limit`                     | protect shared capacity; global across replicas         | fixed window allows edge bursts; fail open                                 |
| Idempotency keys                 | `api-gateway/src/idempotency`                    | safe client retries of `POST`                           | Redis at the edge + UNIQUE(customer_id, key) in order-service; fail closed |
| Correlation ID + timeouts        | `api-gateway/src/correlation`, `proxy`           | trace a request; fail fast instead of hanging           | copied through the outbox into every event (#51)                           |
| Problem details (RFC 9457)       | `libs/errors`                                    | one error format everywhere                             | none worth mentioning                                                      |
| Transactional outbox             | `order-service`, `libs/outbox`                   | no dual write: DB and Kafka can't disagree              | extra table + relay; publish latency; at-least-once                        |
| Event contracts (zod, versioned) | `libs/contracts`                                 | explicit, validated schemas; `.v2` for breaking changes | shared lib couples deploys slightly                                        |
| Idempotent consumer              | `libs/database` `claimEvent`, `processed_events` | redeliveries do nothing                                 | table grows (no retention job yet)                                         |
| Retry topics + DLQ               | `libs/kafka`, ADR 0006                           | don't block a partition on one bad message              | retried messages lose per-key ordering                                     |
| Choreography saga                | consumers in both services                       | loose coupling, no orchestrator SPOF                    | flow is spread out, harder to see                                          |
| Forward-only state machine       | order-service `UPDATE … WHERE status='PENDING'`  | late/duplicate results can't move an order back         | compensation must be explicit                                              |
| Database per service             | separate DBs + roles                             | independent schemas and scaling                         | no joins; consistency is eventual                                          |

## Questions and short answers

### Architecture and boundaries

1. **Walk me through an order.** See the walkthrough above. Key line: "201 means
   accepted and PENDING, not paid; the final status arrives a few seconds later through
   events."
2. **Why microservices for something this small?** To demonstrate the patterns. In real
   life I would start as a modular monolith and split when teams or scaling needs diverge.
   Microservices buy independent deploys and scaling at the cost of distributed-systems
   problems: everything in this repo exists to handle those.
3. **Why database per service?** Each service can change its schema without coordinating,
   and nothing couples through shared tables. The cost: no cross-service joins and only
   eventual consistency. Locally it's one Postgres server with separate databases and roles.
4. **Choreography vs orchestration?** Choreography (ours): services react to events, there
   is no central brain, and coupling is loose; it gets hard to follow beyond ~4-5 steps.
   Orchestration (a saga orchestrator such as Temporal or a state machine) makes the flow
   explicit and easier to change, but it is one more component that must be highly
   available.
5. **Why no synchronous calls between services inside the saga?** A sync call couples
   availability: if payments is down, ordering is down. With events, order-service
   accepts orders while payments is down and they complete when it comes back (demoed).
6. **What does the gateway do, and what doesn't it do?** It handles auth, rate limiting,
   idempotency, routing, timeouts and correlation IDs. It does no business rules (totals,
   status changes), or it becomes a coupling point every team must change.

### Data consistency and messaging

7. **What problem does the outbox solve?** The dual write. "Save to the DB, then publish
   to Kafka" breaks if the process dies between the two: you get an order without an event,
   or an event for an order that rolled back. Writing the event row in the same
   transaction makes both or neither happen; a relay publishes afterwards.
8. **How does the relay avoid double-publishing with several instances?**
   `SELECT … FOR UPDATE SKIP LOCKED` lets each relay take different rows. Even so, the
   guarantee is at-least-once (a crash after publish but before marking the row), so
   consumers must be idempotent.
9. **Why is the Kafka key the `orderId`?** Messages with the same key go to the same
   partition, and a partition is ordered, so all events of one order are consumed in order.
   Parallelism scales with partitions (3 here).
10. **At-least-once vs exactly-once?** We assume at-least-once, the realistic default, and
    make consumers idempotent. Kafka's exactly-once (transactions) only covers
    Kafka→Kafka; once a database is involved, you need idempotency anyway.
11. **How is a consumer idempotent here?** In the same DB transaction as the business
    change, it inserts `(eventId, consumer)` into `processed_events` with
    `ON CONFLICT DO NOTHING`. If nothing was inserted, the event was already handled: skip.
    Atomic, so there is no "handled but not recorded" window.
12. **How do you evolve an event schema?** Additive changes (new optional fields) stay in
    `v1`, and consumers are tolerant readers. A breaking change gets a new topic `.v2`; the
    producer writes both during the migration, consumers move over, then `v1` is retired.
13. **What happens to a message that keeps failing?** Technical errors go to `<topic>.retry`
    with exponential backoff and full jitter, consumed by a separate group so the main
    partition keeps flowing. After N attempts they go to `<topic>.dlq`. Contract violations
    are permanent and go straight to the DLQ. An operator inspects the message and
    replays it by re-publishing to the source topic.
14. **What's the cost of retry topics?** A retried message can be processed after newer
    messages with the same key, so ordering is lost for it. That's why order status moves
    forward only from `PENDING`: a late result can't undo a final state.
15. **A payment result arrives for an unknown order. What then?** It's a real
    inconsistency, not a race we can ignore. It goes to the DLQ, and the idempotency claim
    is rolled back so a replay later can still succeed.
16. **What is eventual consistency here, concretely?** For ~1-3 s an order is `PENDING`
    while payments has already decided. Each DB is correct on its own; they agree once the
    events have flowed. Clients poll (or later get a notification).

### Gateway and API

17. **Why a timeout on every outbound call?** Without one, a slow downstream holds
    connections and memory until the caller fails too (cascading failure). Our 3 s deadline
    turns that into a fast 504; connection failures are 502.
18. **What is a correlation ID, and how is it different from a trace ID?** One ID per
    request: reused from the caller if valid, otherwise generated; returned in the response
    and in error bodies, and searchable in every log. OpenTelemetry trace context adds spans
    and timing; many systems keep both.
19. **JWT vs session cookie?** Sessions are server state (easy to revoke, but need a
    shared store). A JWT is self-contained and verified with a key (scales, works across
    services), but it can't be revoked before expiry. Mitigate with short TTLs (15 min),
    refresh tokens and a `jti` deny-list.
20. **HS256 vs RS256?** HS256 uses one shared secret, so every verifier could also mint
    tokens; fine with only the gateway verifying. RS256 or ES256 sign with a private key and
    verify with a public key from JWKS; that is the norm with an identity provider. Always
    pin the allowed algorithms, or `alg: none` and algorithm confusion become attacks.
21. **Fixed window vs sliding window vs token bucket?** A fixed window is a counter per
    period: simple, but it allows a 2× burst at the boundary (ours). A sliding window
    weights the previous window, which is smoother. A token bucket refills at a rate with a
    burst size, which suits APIs that allow short bursts.
22. **Why must rate-limit state be shared and atomic?** Per-pod counters multiply the
    limit by the replica count. Separate read and increment calls race across pods. One Lua
    script in Redis does it atomically (verified with 2 replicas).
23. **Redis is down. What happens?** Rate limiting fails open: the API stays up and
    limits are briefly unenforced. Idempotency fails closed: `POST /orders` returns 503
    rather than risk a double order, while `GET` keeps working. Same dependency, different
    risk, different decision.
24. **How do idempotency keys work?** The client sends a unique key per attempt. The
    gateway claims it with `SET NX` (lock = timeout + 5 s), forwards the request, and
    stores the final response for 24 h. A retry gets the stored response, a key still in
    flight gets 409, and the same key with a different body gets 422. Keys are scoped per
    user.
25. **Is idempotency at the gateway enough?** No. If order-service commits but answers
    after the gateway's deadline, the gateway returns 504 and frees the key, and a retry
    would duplicate the order. So the gateway forwards the key and order-service stores it
    in `UNIQUE(customer_id, idempotency_key)`, in the same transaction as the order and
    its outbox row. A repeat returns the existing order; a race loser hits the
    constraint, rolls back and returns the winner's order (#56).
26. **How do errors look to clients?** RFC 9457 problem+json from one global filter:
    stable `code`, `status`, `title`, `correlationId`. 5xx responses never expose internal
    details (URLs, SQL); those go to the logs.

### Testing, operations and Node/NestJS

27. **How is it tested?** Unit tests with mocked dependencies (Jest) and e2e tests per HTTP
    service (Supertest, real Nest app, fakes for Kafka and the DB). The gateway e2e tests use
    a real fake order-service HTTP server, which caught a timeout misclassification that
    mocks hid. Testcontainers for real Postgres, Kafka and Redis is planned (#22).
28. **What are liveness vs readiness, and what does each check?** Liveness: is the
    process alive (no dependency checks, or a DB blip restarts healthy pods). Readiness:
    can it serve? Services check their DB. The gateway deliberately does not check
    downstreams, to avoid cascading unreadiness.
29. **Graceful shutdown: why does it matter?** On SIGTERM (deploys, scale-down) the
    services stop consuming, finish in-flight work, close DB pools and Kafka clients, and
    exit. Otherwise you get duplicated processing and connection leaks.
30. **How does config work?** Config comes from environment variables (12-factor),
    validated with a class-validator schema at startup. The process refuses to start with
    bad config, and errors name the variable but never echo its value.
31. **NestJS compared to ASP.NET Core?** Modules ≈ feature folders + `IServiceCollection`
    extensions, providers ≈ DI registrations, guards ≈ authorization filters, interceptors ≈
    action filters/middleware, pipes ≈ model binding + validation, exception filters ≈
    `IExceptionHandler`/ProblemDetails. Node is single-threaded with an event loop, so
    CPU-heavy work blocks everything; I/O-heavy services like these fit it well.
32. **Why KafkaJS, and what's the risk?** It's pure JavaScript, with no native build, so
    it works on Node 26. It's unmaintained, though. The swap to Confluent's client only
    touches `libs/kafka`, because services depend on our wrapper, not the library
    (ADR 0002).

### Scaling: "what would you change for 100× traffic?"

33. Answer in layers, and measure first:
    - **Stateless tiers scale out:** gateway, order and payment pods behind a load
      balancer (Kubernetes HPA). Rate limits and idempotency already live in Redis, not
      in the pods.
    - **Kafka:** more partitions per topic, which means more consumer instances in parallel.
      Keys stay `orderId`, so per-order ordering holds. Watch consumer lag.
    - **Postgres:** connection pooling (PgBouncer), read replicas for `GET`s, the response
      cache (#18) for hot reads; partition or archive `outbox` and `processed_events` (they
      only grow today). The order DB is the likeliest bottleneck; shard by customer if needed.
    - **Outbox relay:** batch publishes, or switch to CDC (Debezium) reading the WAL instead
      of polling.
    - **Redis:** cluster mode (our keys already use `{hash tags}`), with separate instances
      for the cache and for idempotency.
    - **Edge:** move TLS, coarse rate limits and caching to a managed gateway or CDN; keep
      the NestJS gateway for product logic (BFF).
    - **Observability:** OpenTelemetry traces and RED metrics per service, so the next
      bottleneck is visible before it hurts.

### Security

34. **A logged-in user changes the order id in the URL. What stops them?** Ownership is
    part of the query: `WHERE id = ? AND customer_id = ?`, with the customer taken from the
    verified JWT `sub` (the gateway sends it as `x-customer-id` and drops any client copy).
    Someone else's order answers 404, like a missing one, so ids can't be probed. A UUID
    only makes guessing harder; it is not authorization (OWASP API1, BOLA). Lists filter
    the same way, served by an index on `(customer_id, created_at DESC, id DESC)`.

## Known gaps (say them before they're found)

- notification-service is not built yet (#14).
- order-service trusts the gateway for identity (`customerId` in the POST body,
  `x-customer-id` on reads), so it must be reachable only through the gateway
  (NetworkPolicy, M5). Zero-trust option: forward the JWT and verify it in each service.
- No structured JSON logging (nestjs-pino), no OpenTelemetry; OpenAPI docs for
  order-service only (gateway: #65); no Dockerfiles or Kubernetes manifests yet (M4-M6).
- No Testcontainers integration tests yet (#22): the outbox, the Lua rate-limit script
  and the Kafka handlers were verified live and with fakes.
- `outbox` and `processed_events` rows are never cleaned up (retention job).
- Behind a load balancer, Express `trust proxy` must be set, or every caller shares the
  LB's IP in rate limiting.
