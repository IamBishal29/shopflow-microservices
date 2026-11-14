# Progress

## Current
- Milestone: M1 Order service
- Issue: #3 Prisma + Postgres, split into two stacked PRs
  - PR #33 (feat/3-prisma-postgres -> main): Prisma, schema, migration, readiness
  - PR B (feat/3-orders-repository -> feat/3-prisma-postgres): repository, closes #3
- Next step: Syed merges #33 first (delete its branch so GitHub retargets PR B to main),
  then PR B. Then `/next-task` picks up #4 (orders REST API).

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
  domain types (PRs #33 + stacked, learning note 02)

## Decisions waiting for Syed
- None

## Notes
- NestJS 12 is ESM-only; we stay CommonJS and rely on Node `require(esm)` (ADR 0001).
- Commits and PRs carry no Claude attribution lines (Syed's request, 2026-11-14).
- Local DB: `docker compose up -d postgres`, then `pnpm prisma:deploy` (needs
  ORDER_DATABASE_URL in .env; compose default password is `shopflow`).
- PRs over ~250 lines get split into stacked PRs (done for #3).

## Log
- 2026-11-14: agent kit added
- 2026-11-14: kickoff done, PRs opened
- 2026-11-14: #2 config module, PR #32 (merged)
- 2026-11-14: #3 Prisma + Postgres, PR #33 + stacked repository PR
