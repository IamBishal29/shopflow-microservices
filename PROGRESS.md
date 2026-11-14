# Progress

## Current
- Milestone: M2 Event backbone
- Issue: #7 Kafka KRaft + libs/kafka, PR open (targets main)
- Branch: feat/7-kafka-backbone (done; waiting for merge)
- Next step: Syed merges the #7 PR, then `/next-task` picks up #8 (event contracts in
  libs/contracts), then #9 outbox.

## Interview plan (interview ~2026-11-17, ~6 h/day)
Work `interview-critical` issues first, in this order (GitHub issue numbers):
- Day 1: #2 config, #3 Prisma, #4 orders API, #5 error filter, #7 Kafka + KafkaJS module
- Day 2: #8 contracts, #9 outbox, #10 payment-service, #11 idempotent consumers,
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
  Confluent client had no Node 26 build (ADR 0002 amendment, learning note 05)

## Decisions waiting for Syed
- None

## Notes
- NestJS 12 is ESM-only; we stay CommonJS and rely on Node `require(esm)` (ADR 0001).
- Commits and PRs carry no Claude attribution lines (Syed's request, 2026-11-14).
- Local DB: `docker compose up -d postgres`, then `pnpm prisma:deploy` (needs
  ORDER_DATABASE_URL in .env; compose default password is `shopflow`).
- No stacked PRs: every PR targets main (#34 landed on a feature branch; fixed by #35).
- kafkajs is unmaintained; prints TimeoutNegativeWarning on Node 26 (harmless). Swap to
  @confluentinc/kafka-javascript once it ships Node 26 prebuilts (only libs/kafka changes).
- Git Bash on Windows: prefix docker exec commands with MSYS_NO_PATHCONV=1.
- Known limitation: unit prices come from the client (no catalogue, PRD out of scope);
  customerId comes from the body until JWT (#16).

## Log
- 2026-11-14: agent kit added
- 2026-11-14: kickoff done, PRs opened
- 2026-11-14: #2 config module, PR #32 (merged)
- 2026-11-14: #3 Prisma + Postgres, PRs #33 + #34 (merged), #35 recovery
- 2026-11-14: #4 orders API (PRs #35, #36 merged)
- 2026-11-14: #5 problem details filter (PR #37 merged)
- 2026-11-14: #7 Kafka backbone
