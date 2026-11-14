---
name: kickoff
description: One-time project kickoff for ShopFlow - confirm choices, write the PRD and architecture, scaffold the NestJS monorepo with CI, and create the GitHub backlog.
---

1. Read CLAUDE.md and PROGRESS.md. The architecture in CLAUDE.md is fixed; do not
   re-ask it.
2. Ask me with AskUserQuestion, at most 6 questions in total, in small batches, only
   about open choices, e.g.: Kafka client (@nestjs/microservices Kafka transport vs
   KafkaJS directly), gateway style (NestJS proxy app vs Kong/Traefik), local Kubernetes
   (kind vs minikube), monorepo tool (Nest CLI monorepo vs Nx), how much time per day I
   have (to size issues), and my interview date if any.
3. Write `docs/PRD.md` (1-2 pages): problem, user flows (place order -> pay -> notify),
   functional scope, non-functional goals (reliability, idempotency, observability),
   out of scope, success criteria ("demo-able in an interview").
4. Write `docs/ARCHITECTURE.md` with Mermaid diagrams: services and data stores, the saga
   sequence (happy path and payment failure), and the Kafka topics table
   (topic, key, producer, consumers, payload version). Write
   `docs/decisions/0001-stack.md` as the first ADR, plus one ADR per choice from step 2.
5. Scaffold, in a `chore/kickoff-scaffold` branch:
   - Nest CLI monorepo with pnpm: `apps/order-service` first (the other apps come with
     their issues) and `libs/contracts`.
   - `tsconfig` strict, ESLint (typescript-eslint type-checked) + Prettier, Jest with one
     passing unit test and one passing e2e test (Supertest) for `/health`.
   - `package.json` scripts: `lint`, `format:check`, `typecheck`, `test`, `test:e2e`,
     `build`.
   - `docker-compose.yml` with Postgres only (Kafka and Redis come with their issues).
   - `.gitignore` (node_modules, dist, coverage, .env, .env.*, !.env.example,
     .claude/settings.local.json), `.env.example`, `.nvmrc`, `.editorconfig`,
     `README.md` (what it is, architecture diagram link, quick start).
   - `.github/workflows/ci.yml`: on pull_request and push to main; pnpm cache;
     `pnpm install --frozen-lockfile`, lint, format:check, typecheck, test, test:e2e, build.
   - `.github/pull_request_template.md` (Closes #, summary, how to test, review notes,
     checklist: tests, lint, docs/learning note).
   Keep scaffold and docs in two PRs if the diff gets large.
6. Draft milestones that follow the learning plan, 3-8 small issues each (goal,
   acceptance criteria, "concepts you'll learn", "interview angle"):
   M1 Order service (CRUD, validation, Swagger, config, errors, Prisma + Postgres)
   M2 Event backbone (Kafka KRaft + UI, contracts lib, payment-service, outbox,
      idempotent consumers, retries + DLQ, saga completion, notification-service)
   M3 Edge (api-gateway, JWT, routing, correlation ID, Redis cache, rate limiting,
      idempotency keys)
   M4 Containers (multi-stage Dockerfiles, full compose, health checks, Testcontainers
      integration tests in CI, Docker build in CI)
   M5 Kubernetes (kind, manifests or Helm, probes, Strimzi, Ingress)
   M6 Production polish (pino logs, OpenTelemetry + Jaeger, README, interview Q&A doc)
   Show me the list; after I approve, create labels, milestones and issues (GitHub MCP,
   or `gh` / `gh api repos/{owner}/{repo}/milestones` as fallback).
7. Write `docs/learning/00-how-we-work.md`: git flow, PRs, CI, ADRs, monorepo layout,
   in plain words with a .NET comparison table.
8. Fill "Project facts" in CLAUDE.md and update PROGRESS.md.
9. Commit, push, open the PR(s), and give me the links.
