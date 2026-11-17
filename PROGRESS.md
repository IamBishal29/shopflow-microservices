# Progress

## Current
- Milestone: M4 Containers (M1-M3 complete)
- Issue: #72 bounded shutdown, PR #75 open (Syed chose #72 before #22 because Docker was down).
- Branch: fix/72-bounded-kafka-shutdown (done; waiting for merge)
- Next step: Syed merges #75. Then start Docker Desktop + add JWT_SECRET to .env, and run
  the queued live checks: #21 (`docker compose up -d --build`, all healthy, README demo)
  and #72 (`docker compose stop kafka`; `docker stop shopflow-order-service` < 10 s,
  exit 0). Next issue: #22 Testcontainers (needs Docker), then #23.

## Interview plan (interview ~2026-11-17, ~6 h/day)
Work `interview-critical` issues first, in this order (GitHub issue numbers):
- Day 1: #2 config, #3 Prisma, #4 orders API, #5 error filter, #7 Kafka + KafkaJS module
- Day 2: #8 contracts, #9 outbox, #41 + #42 + #10 payment-service, #11 idempotent consumers,
  #12 retries + DLQ, #13 saga completion
- Day 3: #49 gateway scaffold, #15 gateway + correlation ID, #16 JWT, #17 rate limiting, #19 idempotency keys,
  #29 interview Q&A doc
- After the interview: #6, #14, #18, then M4-M6.

## Done
- Day 1 (manual): TypeScript basics, async/await, Promise.all (orders.ts practice)
- Day 2 (manual, local only): NestJS scaffold + in-memory Order CRUD with validation
- Agent kit added (CLAUDE.md, skills, settings)
- Kickoff: choices made (ADRs 0001-0005), PRD + architecture docs, monorepo scaffold with
  CI, 6 milestones and 28 issues (#2-#29), learning note 00
- #2 config: @nestjs/config + class-validator env schema, fail fast, no values echoed
  (PR #32, learning note 01)
- #3 Prisma 7 + pg adapter, orders/order_items with CHECK constraints, custom DB readiness
  check (verified live/ready against real Postgres stop/start), OrdersRepository with
  domain types (PRs #33, #34, recovery #35, learning note 02)
- #4 orders API: POST/GET/:id/list, global ValidationPipe via APP_PIPE, server-side totals,
  bounded inputs; verified against real Postgres (learning note 03)
- #5 errors: DomainError (code, kind, title) in services; global RFC 9457 problem+json
  filter; 5xx never expose detail; health keeps Terminus 503 body (learning note 04)
- #7 Kafka: apache/kafka 4.4 KRaft + kafka-init topics + kafbat UI in compose; libs/kafka
  (idempotent producer, manual-commit consumer, shutdown ordering); kafkajs kept after
  Confluent client had no Node 26 build (ADR 0002 amendment, learning note 05) (PR #38)
- #8 contracts: zod schemas for order.created / payment.succeeded / payment.failed v1,
  TOPICS + dlqTopic, parseEvent -> ContractViolationError (poison messages), tolerant
  reader, fixtures (PR #39, learning note 06)
- #9 outbox: outbox table (partial index), order + event in one transaction, OutboxRelay
  (SKIP LOCKED, acks=all, backoff 1-30 s, graceful stop); verified live incl. Kafka
  outage and recovery (PR #40, learning note 07)
- #41 shared libs: libs/database (SqlClient interface, DATABASE token, health check) and
  libs/outbox (relay); order-service rewired, raw-SQL publish mark verified live
  (PR #43, learning note 08)
- #42 payment-service scaffold: postgres-init job (payments DB + role, CONNECT revoked),
  payments/outbox schema with CHECKs, config, health; verified isolation and readiness
  live (PR #44, learning note 09)
- #10 payment consumer: OrderCreatedConsumer (thin, poison skip until #12, background
  start), PaymentsService (decline above PAYMENT_DECLINE_ABOVE_CENTS), payment + result
  event in one transaction, unique order_id = no double charge; verified live incl.
  duplicate replay and poison message (PR #45, learning note 10)
- #11 idempotent consumers: claimEvent (ON CONFLICT DO NOTHING) in libs/database,
  processed_events (event_id, consumer) in payments DB, claimed in the payment transaction;
  verified live by rewinding the consumer group: 9 redeliveries, 0 new payments
  (PR #46, learning note 11)
- #12 retries + DLQ (Syed chose retry topics): libs/kafka routes failures to
  <topic>.retry (backoff + full jitter, second consumer group) or <topic>.dlq
  (permanent/exhausted); ContractViolationError permanent; verified live: recover,
  exhaust, poison, DLQ replay (PR #47, ADR 0006, learning note 12)
- #13 saga completion: PaymentResultsConsumer, processed_events in orders DB, atomic
  PENDING -> PAID | PAYMENT_FAILED (conditional UPDATE); late results ignored, unknown
  order -> DLQ with claim rolled back; full saga verified live in ~3 s
  (PR #48, learning note 13)
- #49 gateway scaffold (split from #15, Syed's choice; native fetch chosen for #15):
  libs/errors (DomainError + problem details + filter moved from order-service),
  apps/api-gateway :3000 with validated config, health (readiness ignores downstreams);
  verified live (PR #50, learning note 14)
- #15 gateway proxy: CorrelationIdMiddleware (reuse valid or generate UUID), explicit
  /orders routes, fetch + AbortSignal.timeout -> 504, transport failure -> 502, downstream
  problem bodies passed through, header allowlist; e2e with a real fake order-service
  caught a timeout misclassification; verified live through the full saga
  (PR #52, learning note 15). Follow-up #51 created.
- #16 JWT (Syed chose @nestjs/jwt + own guard, HS256, customerId later = #53): global
  JwtAuthGuard (alg pinned, exp/iss/aud, sub required), @Public() for health + dev token,
  POST /auth/token 404 outside development, 401 problem+json + WWW-Authenticate; e2e for
  expired / forged / wrong aud / alg none; verified live (PR #54, learning note 16)
- #17 rate limiting (Syed chose @nestjs/throttler + own Redis storage, ioredis, fail
  open): redis 8.8.4 in compose (no persistence), atomic Lua fixed window + block,
  {hash-tag} keys, per JWT sub or IP, one budget across routes, 429 problem+json +
  Retry-After, health skipped; verified live with 2 replicas sharing Redis and with Redis
  stopped (~3 ms, fail open) (PR #55, learning note 17)
- #19 idempotency keys (Syed chose gateway-only now + follow-up #56, fail closed):
  Idempotency-Key required on POST /orders; SET NX lock (timeout + 5 s), stored final
  response 24 h, fingerprint (canonical JSON), per-sub scope; replay / 409 / 422 / 400 /
  503 + Retry-After; verified live incl. a real parallel race and Redis stopped
  (PR #57, learning note 18)
- #29 docs: README architecture diagram, gateway demo script, failure demos (every
  command run live first); docs/INTERVIEW.md with walkthrough, pattern map, 33 Q&As,
  100x answer, known gaps (PR #58, learning note 19)
- #18 response cache: cache-aside for GET /orders/:id in Redis, key per JWT sub +
  orderId, only 200 cached, TTL `ORDER_CACHE_TTL_SECONDS` (default 5 s), no invalidation
  (staleness <= TTL), fail open, `X-Cache: HIT|MISS`; FakeRedis moved to src/redis.
  Not verified live (Docker Desktop not running) (PR #59, learning note 20)
- #51 correlation ID: `correlationIdOrNew` in libs/errors (gateway middleware + order
  controller), OrdersService.create(command, correlationId) stamps it on order.created;
  payment-service already copied it to payment.* events, so one ID spans the saga.
  Not verified live (Docker down) (PR #60, learning note 21)
- #53 BOLA fix (Syed chose: gateway overwrites body): `withCustomerId(body, sub)` in the
  gateway, applied before the idempotency fingerprint; e2e for spoof + spoofed retry
  replay; INTERVIEW.md gaps updated; read-side gap filed as #61 (PR #62, learning note 22)
- #56 end-to-end idempotency (Syed chose: column on orders, repeat returns existing):
  migration `orders.idempotency_key` + UNIQUE(customer_id, idempotency_key); repository
  lookup fast path + P2002 race -> winner's order (loser's outbox row rolled back);
  201 + Idempotent-Replayed; gateway forwards the header; e2e for retry-after-504.
  Migration not applied to a real DB yet (Docker down) (PR #63, learning note 23)
- #61 ownership on reads (Syed chose: trusted header + list index): gateway sends JWT
  `sub` as `x-customer-id` (required in DownstreamRequest, client copy dropped);
  order-service reads `WHERE id AND customer_id`, other customer's order -> 404, missing
  identity -> 401; index (customer_id, created_at DESC, id DESC) replaces
  (customer_id, created_at). Not verified live (Docker down) (PR #64, learning note 24)
- #6 OpenAPI (Syed chose: explicit decorators, order-service only): /docs + /docs-json,
  shared ProblemDetails schema (problem+json) per route, response schemas `implements`
  the domain types, e2e incl. DTO drift guard (validated fields == documented fields);
  gateway docs = follow-up #65 (PR #66, learning note 25)
- #67 (part 1 of #14): `KafkaConsumerService.runInBackground` (start without blocking,
  retry every 5 s, stop on shutdown); both existing consumers use it; no behaviour change
  (PR #69, learning note 26)
- #68 (part 2 of #14): apps/notification-service :3003 (config, health, Prisma, shutdown
  hooks), `notifications` DB + role in postgres-init, `notifications` table (UNIQUE
  event_id = dedupe key + audit log, CHECKs on type/channel/message); built app checked
  without a DB: /health 200, /health/ready 503, bad URL fails fast (PR #70, learning note 27)
- #14 (part 3): PaymentResultsConsumer in its own group `notification-service` (fan-out),
  pure notificationFor (integer amount formatting), NotificationSender port + log adapter
  (token NOTIFICATION_SENDER), repository inserts row + sends in one transaction (10 s
  timeout; P2002 -> duplicate). Not verified live (Docker down) (PR #71, learning note 28)
- #20 Dockerfile (Syed chose: node:26-alpine, one file + APP build-arg): deps (pnpm
  fetch, cache mount) -> build -> prod-deps (rm node_modules first, --prod) -> runtime
  node:26.13.1-alpine3.24, USER node, read-only code, exec node as PID 1; 476 MB per
  image (was 971 MB: pnpm fetch left every package in .pnpm). Verified: builds, uid
  1000, ready 200 vs compose Postgres, docker stop 558 ms exit 0 with Kafka up
  (PR #73, learning note 29). Found: #72 shutdown hangs while Kafka unreachable;
  compose Kafka advertises localhost only (noted on #21).
- #21 compose (PR #74): `migrate` Dockerfile target (Prisma CLI + migrations, no app
  code) run as one-shot jobs per DB; 4 services with readiness healthchecks; startup gated
  postgres -> postgres-init -> *-migrate -> app, kafka -> kafka-init -> app, order-service
  + redis -> gateway; gateway NODE_ENV=development for the demo; JWT_SECRET required
  (`:?`); CI runs `docker compose config`. Learning note 30. Merged without the live check.
- #72 bounded shutdown (PR #75): `settleWithin` + SHUTDOWN_STEP_TIMEOUT_MS (3 s) in
  libs/kafka; consumer disconnect, producer disconnect and outbox in-flight batch bounded;
  producer rejects sends once closing. Abandoning is safe (at-least-once + dedupe).
  Unit tests with fake timers. Not verified live (Docker down). Learning note 31.

## Decisions waiting for Syed
- #21: `docker compose config` says .env has no JWT_SECRET. Add one
  (`openssl rand -base64 48`), or `docker compose up` stops with a clear error.
- #21: gateway runs with NODE_ENV=development in compose (dev token endpoint on). OK for
  the local stack? Apps use host ports 3000-3003, so stop compose apps before `pnpm start:*`.
- #21: the migrate image carries all dev deps (big, tooling only). Slim it later?
- The last PROGRESS commit of #20 (a9e27c6) was pushed after #73 merged; restored here.
- Please add to `.env.example` and `.env` (Claude may not read/edit them):
  `PAYMENT_SERVICE_PORT=3002`,
  `PAYMENT_DATABASE_URL=postgresql://payments:payments@localhost:5432/payments`.
- Please also add: `GATEWAY_PORT=3000`, `ORDER_SERVICE_URL=http://localhost:3001`,
  `DOWNSTREAM_TIMEOUT_MS=3000`.
- And for #16: `.env.example` placeholder `JWT_SECRET=change-me-to-32+-random-chars`,
  `JWT_ISSUER=shopflow-gateway`, `JWT_AUDIENCE=shopflow-api`, `JWT_TTL_SECONDS=900`;
  in `.env` a real secret (`openssl rand -base64 48`) and `NODE_ENV=development` for
  the dev token endpoint.
- And for #17: `REDIS_URL=redis://localhost:6379`, `RATE_LIMIT_MAX=100`,
  `RATE_LIMIT_WINDOW_SECONDS=60`.
- Followed the Day 3 plan (#19 before #18) since no answer came; say if you prefer
  strict issue order from now on.
- And for #19: `IDEMPOTENCY_TTL_SECONDS=86400`.
- And for #18: `ORDER_CACHE_TTL_SECONDS=5`. Is 5 s staleness OK, or shorter/longer?
- #18 not checked live: start Docker Desktop, then GET an order twice through the
  gateway (MISS, then HIT).
- #56: after merging, `pnpm prisma:deploy`; then two POST /orders to :3001 with the same
  idempotency-key -> same id, one row in `outbox` for it.
- For #68: add to `.env.example` and `.env`: `NOTIFICATION_SERVICE_PORT=3003`,
  `NOTIFICATION_DATABASE_URL=postgresql://notifications:notifications@localhost:5432/notifications`.
- #14 contract gap: payment.* events carry no customerId, so a real sender wouldn't know
  whom to notify. Fine for the log sender; real channels need a contract change (v2 or an
  optional field). Decide when we add email/SMS.
- PR #70 is ~420 lines (half copied boilerplate from payment-service); kept whole.
- PR #71 is ~588 lines (~260 code, ~330 tests); should have been split (consumer vs
  sender port). OK to keep, or split?
- #14 not checked live: full saga, then reset the notification-service group to
  earliest -> "Duplicate … already notified", no new rows (steps in PR #71).
- notification-service .env keys: NOTIFICATION_SERVICE_PORT, NOTIFICATION_DATABASE_URL,
  KAFKA_BROKERS (shared key, already used by the other services).
- validateEnv now copied in 4 apps: extract into a lib (follow-up issue)?
- #6 not checked live: `pnpm start:order`, open http://localhost:3001/docs.
- #66 is ~316 lines in apps/ (decorators + ~100 test lines), over the cap; kept whole.
- #61: after merging, `pnpm prisma:deploy`; then with dev tokens for c-1 and c-2, an
  order of c-1 read as c-2 -> 404, and `GET /orders` as c-2 doesn't list it.
- order-service now answers 401 on GET /orders(/:id) without `x-customer-id`: direct
  curl calls to :3001 must send it (the gateway always does).
- #53 not checked live: dev token for c-1, POST /orders with `"customerId":"c-999"` ->
  response shows customerId c-1.
- `git push` hangs in Claude's shell (Git Credential Manager prompt?); #53 was pushed with
  `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`.
  Check GCM on your side, or keep that workaround.
- #51 not checked live: POST /orders via the gateway with `x-correlation-id: demo-1`;
  kafbat UI should show demo-1 on order.created and payment.succeeded.
- Docker Desktop runs now (disk image moved to D:; C: had filled up and crashed it).
  The queued live checks (#18, #51, #53, #56, #61, #6, #14) can be run any time.
- Images are 476 MB each: every service ships all prod deps of the single root
  package.json. Per-service deps would need a pnpm workspace split. Worth it?
- POST /orders now needs an Idempotency-Key header (400 without): README demo/curl
  examples that create orders through the gateway must send one.
- Optional follow-up: validateEnv is copied in 3 apps; extract a helper?
- PR #52 is ~445 code lines (205 prod + 240 tests), over the cap; kept whole before the
  interview. OK, or split next time?
- Made for #10: shared libs extracted; payments DB = same Postgres, own database
  and role; payment-service split into 3 sequential PRs.

## Notes
- NestJS 12 is ESM-only; we stay CommonJS and rely on Node `require(esm)` (ADR 0001).
- Commits and PRs carry no Claude attribution lines (Syed's request, 2026-11-14).
- Local DB: `docker compose up -d postgres`, then `pnpm prisma:deploy` (needs
  ORDER_DATABASE_URL in .env; compose default password is `shopflow`).
- No stacked PRs: every PR targets main (#34 landed on a feature branch; fixed by #35).
- kafkajs is unmaintained; prints TimeoutNegativeWarning on Node 26 (harmless). Swap to
  @confluentinc/kafka-javascript once it ships Node 26 prebuilts (only libs/kafka changes).
- Git Bash on Windows: prefix docker exec commands with MSYS_NO_PATHCONV=1.
- Outbox: published rows are never deleted yet (cleanup job = future work).
- Local DB roles: `payments` role owns `payments`; order-service still uses the compose
  superuser (own role = follow-up before K8s). New payment migrations: write with
  `prisma migrate diff` (the payments role has no CREATEDB for a shadow DB).
- processed_events and published outbox rows are never deleted yet (retention job = future).
- Retry topics lose per-key ordering for retried messages (ADR 0006); #13 must only move
  order status forward from PENDING. DLQ replay = re-publish key/value to the source topic.
- Order 6ef59cb5… (customer c-42, from #4) stays PENDING forever: created before the
  outbox existed, so no event. Harmless local test data.
- .env is not picked up by `start:*:prod` locally (services failed config validation);
  for live checks Claude passes ORDER_DATABASE_URL / PAYMENT_DATABASE_URL / KAFKA_BROKERS
  explicitly. Syed: check that .env has these keys.
- Rate limiting: Lua script only verified live; automate with Testcontainers (#22).
  Behind a load balancer set Express `trust proxy` or every client shares the LB's IP.
- Gateway follow-ups: abort downstream call on client disconnect; circuit breaker (M5?).
- Known limitation: unit prices come from the client (no catalogue, PRD out of scope);
  customerId comes from the body until JWT (#16).

## Log
- 2026-11-14: agent kit added
- 2026-11-14: kickoff done, PRs opened
- 2026-11-14: #2 config module, PR #32 (merged)
- 2026-11-14: #3 Prisma + Postgres, PRs #33 + #34 (merged), #35 recovery
- 2026-11-14: #4 orders API (PRs #35, #36 merged)
- 2026-11-14: #5 problem details filter (PR #37 merged)
- 2026-11-14: #7 Kafka backbone (PR #38 merged)
- 2026-11-14: #8 event contracts (PR #39 merged)
- 2026-11-14: #9 transactional outbox (PR #40 merged)
- 2026-11-14: #10 split into #41/#42/#10 (Syed's choice); #41 shared libs (PR #43 merged)
- 2026-11-14: #42 payment-service scaffold (PR #44 merged)
- 2026-11-14: #10 payment consumer (PR #45 merged)
- 2026-11-14: #11 idempotent consumers (PR #46 merged)
- 2026-11-14: #12 retry topics + DLQ (PR #47 merged)
- 2026-11-14: #13 saga completion, PR #48 (merged)
- 2026-11-15: #49 gateway scaffold, PR #50 (merged)
- 2026-11-15: #15 gateway proxy + correlation ID, PR #52 (merged)
- 2026-11-15: #16 JWT auth, PR #54 (merged)
- 2026-11-15: #17 rate limiting, PR #55 (merged)
- 2026-11-15: #19 idempotency keys, PR #57 (merged)
- 2026-11-15: #29 demo script + interview guide, PR #58 (merged)
- 2026-11-16: #18 response cache, PR #59 (merged)
- 2026-11-16: #51 correlation ID into order.created, PR #60 (merged)
- 2026-11-16: #53 customerId from JWT sub, PR #62 (merged); follow-up #61 created
- 2026-11-16: #56 end-to-end idempotency, PR #63 (merged)
- 2026-11-16: #61 ownership check on reads, PR #64 (merged)
- 2026-11-16: #6 OpenAPI docs, PR #66 (merged; CI fix: deny @scarf/scarf build); #65 filed
- 2026-11-16: #14 split into #67/#68/#14 (Syed's choice; own Postgres DB for dedupe)
- 2026-11-16: #67 consumer background start in libs/kafka, PR #69 (merged)
- 2026-11-16: #68 notification-service scaffold, PR #70 (merged)
- 2026-11-16: #14 notification consumer + sender port, PR #71 (merged)
- 2026-11-16: #20 Dockerfiles, PR #73 (merged; Docker disk moved to D: after C: filled up)
- 2026-11-17: #21 full docker compose, PR #74 (merged; live check pending Docker)
- 2026-11-17: #72 bounded shutdown, PR #75
