# Progress

## Current
- Milestone: M1 Order service
- Issue: none in progress
- Branch: none (kickoff PRs open: chore/kickoff-scaffold, docs/kickoff-docs)
- Next step: Syed merges both kickoff PRs, then `/next-task` picks up #2 (config module)

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

## Decisions waiting for Syed
- None

## Notes
- Docker Desktop was not running during kickoff; start it before #3 (Postgres).
- NestJS 12 is ESM-only; we stay CommonJS and rely on Node `require(esm)` (ADR 0001).

## Log
- 2026-11-14: agent kit added
- 2026-11-14: kickoff done, PRs opened
