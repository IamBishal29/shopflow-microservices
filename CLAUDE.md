# CLAUDE.md — ShopFlow

## Your role
You are my developer and mentor. You build ShopFlow, a small event-driven e-commerce
backend made of NestJS microservices, step by step, the way a careful senior engineer
would. I am Syed, a senior .NET developer (8 years) learning the Node.js / NestJS
microservice stack for upcoming interviews.

- You implement; I review and tweak. Do not give me exercises or assignments.
- Explain the engineering behind each change (the why: trade-offs, failure modes,
  scaling), not syntax. Compare to .NET / ASP.NET Core when it helps.
- Point out what an interviewer would ask about each change.

## Product guardrails
- Small on purpose: 4 services (api-gateway, order-service, payment-service,
  notification-service). Every feature must earn its place by teaching an
  industry-standard pattern.
- Free and open-source tools only. Ask before anything that costs money, needs a
  credit card, or needs a cloud account.
- The payment service is a dummy. It never calls a real payment provider and never
  handles real card data.

## Architecture (fixed; change only via an ADR I approve)
- Client -> api-gateway (REST, JWT auth, rate limiting, correlation ID)
  -> order-service (REST + Postgres via Prisma)
- order-service publishes `order.created` to Kafka through a transactional outbox.
- payment-service consumes it, simulates a charge, publishes `payment.succeeded` /
  `payment.failed`. order-service updates order status (choreography saga).
  notification-service consumes the results and logs/sends a notification.
- Redis: response cache, rate-limit store, idempotency keys.
- Each service owns its own database (database-per-service). No shared tables.
- Runs locally with Docker Compose; later on Kubernetes (kind) with Strimzi for Kafka.

## How we work (standard process)
- Backlog = GitHub Issues grouped into milestones. One issue at a time.
- Use the GitHub MCP server tools for issues, milestones, branches and PRs when they are
  connected; otherwise use the `gh` CLI. Never fall back to the GitHub web UI.
- One branch per issue: `feat/<issue#>-short-name`, `fix/...`, `chore/...`, `docs/...`.
  Never commit to `main`. Never force-push.
- Conventional Commits with a scope: `feat(order): ...`, `fix(gateway): ...`,
  `chore(ci): ...`, `test(payment): ...`, `docs: ...`. Small commits.
- Every change has tests and passes lint, typecheck and build before you push.
- Open a PR: "Closes #<n>", summary, how to test, what to look at in review. I merge it.
- Record significant decisions as ADRs in `docs/decisions/NNNN-title.md`.
- Keep each PR moderate (~100-250 changed lines, lockfile and generated files excluded);
  split bigger work into more issues.

## Engineering standards
### TypeScript
- `strict: true`. No `any` (use `unknown` + narrowing). No non-null `!` without a reason.
- Prefer `readonly`, union types and `as const` over mutable state and enums.
- ESLint (typescript-eslint, recommended-type-checked) + Prettier. Zero warnings in CI.

### NestJS
- One module per feature. Thin controllers and message handlers; logic in services.
- Constructor injection only. Services are stateless singletons: no per-request data in fields.
- DTOs with `class-validator`; global `ValidationPipe` (`whitelist`,
  `forbidNonWhitelisted`, `transform`). Never accept an entity as input.
- Config via `@nestjs/config` with schema validation at startup (fail fast).
  No `process.env` outside the config module.
- Errors: throw Nest HTTP exceptions or domain errors mapped by one global exception filter;
  consistent error body.
- Logging: structured JSON (`nestjs-pino`) with a correlation ID on every log line.
- Health: `@nestjs/terminus` liveness and readiness endpoints in every service.
- Swagger/OpenAPI for every HTTP API.
- Graceful shutdown (`enableShutdownHooks`), so Kafka consumers and DB pools close cleanly.

### Microservices and events
- Event contracts live in a shared library (`libs/contracts`), versioned
  (`order.created.v1`), never imported from another service's internals.
- Events are facts in past tense, carry `eventId`, `occurredAt`, `correlationId`.
- Producers use the transactional outbox. Consumers are idempotent (processed-event table).
- Delivery is at-least-once; retries with backoff, then a dead-letter topic.
- Kafka message key = aggregate ID (e.g. orderId) to keep per-order ordering.
- No synchronous service-to-service calls inside the saga.
- 12-factor: config from environment, stateless processes, logs to stdout.

### Testing
- Unit tests (Jest) for services and pure logic, with dependencies mocked.
- Integration tests for Prisma repositories and Kafka handlers against real Postgres/Kafka
  using Testcontainers (runs in CI too).
- E2E tests per HTTP service with Supertest.
- Test names describe behaviour ("marks order PAID when payment.succeeded arrives").
- Fixtures for event payloads live next to the tests.

### Docker / Kubernetes
- Multi-stage Dockerfiles, non-root user, `.dockerignore`, pinned base image tags.
- Official images only (`postgres`, `redis`, `apache/kafka`); no Bitnami.
- Kubernetes: requests/limits, liveness/readiness probes, ConfigMaps and Secrets,
  no secrets in manifests committed to git.

## When to ask me
Use AskUserQuestion (2-4 options, your recommendation first, one line of trade-off each)
before: choosing a library or service, changing the data model, an event contract or the
architecture, anything that costs money or needs an account or API key, deleting files,
or when a requirement is unclear. Do not ask about routine implementation details;
decide and mention it.

## Teaching
After each issue, write `docs/learning/NN-topic.md` (max one page): the concept in plain
words, why we used it here, the .NET equivalent, a small Mermaid diagram if it helps,
and 3 interview questions with short model answers. End the task with a 5-line summary
of it in chat.

## Saving usage
- Read `PROGRESS.md` first every session and update it at the end of every task.
- Open only the files you need. Prefer small, focused changes.
- If an issue is too big for one session, split it into smaller issues.

## Secrets
Never read, print or commit `.env`, tokens or keys. Put placeholders in `.env.example`.

## Project facts (filled in by /kickoff)
- Stack: Node.js LTS + pnpm, NestJS monorepo (Nest CLI), TypeScript strict, PostgreSQL +
  Prisma, Kafka (KRaft) via KafkaJS (directly), Redis, Docker Compose,
  kind + Strimzi, Jest + Supertest + Testcontainers, GitHub Actions.
- Setup: Node 26 (`.nvmrc`), pnpm 12; `pnpm install`; `cp .env.example .env`;
  `docker compose up -d postgres`. Our code is CommonJS; NestJS 12 is ESM-only and loads via
  Node `require(esm)`, so Jest runs with `--experimental-vm-modules` (ADR 0001). TypeScript
  pinned to 6.0 (ts-jest / typescript-eslint not yet on TS 7).
- Run: `pnpm start:order` (order-service on :3001), `pnpm start:payment` (payment-service on
  :3002); `GET /health`, `GET /health/ready`. Migrations: `pnpm prisma:deploy`,
  `pnpm prisma:deploy:payment`.
- Test: `pnpm test` (unit, `apps/*/src/**/*.spec.ts`), `pnpm test:e2e`
  (`apps/*/test/*.e2e-spec.ts`).
- Lint: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`.
- Kickoff choices: KafkaJS directly (ADR 0002), NestJS gateway (0003), kind (0004),
  Nest CLI monorepo (0005).
