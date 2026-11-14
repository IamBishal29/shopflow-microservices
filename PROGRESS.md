# Progress

## Current
- Milestone: M2 Event backbone
- Issue: #13 saga completion, PR #48 open (targets main). Day 2 plan complete.
- Branch: feat/13-saga-completion (done; waiting for merge)
- Next step: Syed merges PR #48, then `/next-task` picks up Day 3: #15 (api-gateway +
  correlation ID, milestone M3).

## Interview plan (interview ~2026-11-17, ~6 h/day)
Work `interview-critical` issues first, in this order (GitHub issue numbers):
- Day 1: #2 config, #3 Prisma, #4 orders API, #5 error filter, #7 Kafka + KafkaJS module
- Day 2: #8 contracts, #9 outbox, #41 + #42 + #10 payment-service, #11 idempotent consumers,
  #12 retries + DLQ, #13 saga completion
- Day 3: #15 gateway + correlation ID, #16 JWT, #17 rate limiting, #19 idempotency keys,
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

## Decisions waiting for Syed
- Please add to `.env.example` and `.env` (Claude may not read/edit them):
  `PAYMENT_SERVICE_PORT=3002`,
  `PAYMENT_DATABASE_URL=postgresql://payments:payments@localhost:5432/payments`.
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
- Outbox: published rows are never deleted yet (cleanup job = future work); correlationId
  is a random UUID per order until #15.
- Local DB roles: `payments` role owns `payments`; order-service still uses the compose
  superuser (own role = follow-up before K8s). New payment migrations: write with
  `prisma migrate diff` (the payments role has no CREATEDB for a shadow DB).
- processed_events and published outbox rows are never deleted yet (retention job = future).
- Retry topics lose per-key ordering for retried messages (ADR 0006); #13 must only move
  order status forward from PENDING. DLQ replay = re-publish key/value to the source topic.
- Order 6ef59cb5… (customer c-42, from #4) stays PENDING forever: created before the
  outbox existed, so no event. Harmless local test data.
- Consumer start-with-retry is duplicated in order- and payment-service; move into
  libs/kafka when a third consumer appears (notification-service, #14).
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
- 2026-11-14: #13 saga completion, PR #48
