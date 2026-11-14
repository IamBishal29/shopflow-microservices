# ShopFlow

A small, event-driven e-commerce backend built with NestJS microservices: place an order,
pay for it (simulated), and get notified. It exists to demonstrate industry-standard
microservice patterns: transactional outbox, idempotent consumers, choreography saga,
dead-letter topics, API gateway, and observability.

- Product requirements: [docs/PRD.md](docs/PRD.md)
- Architecture and diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Decisions (ADRs): [docs/decisions](docs/decisions)
- Learning notes: [docs/learning](docs/learning)

| Service              | Status  | Responsibility                                       |
| -------------------- | ------- | ---------------------------------------------------- |
| order-service        | working | Orders REST API, Postgres (Prisma), outbox publisher |
| payment-service      | working | Consumes `order.created`, simulates a charge         |
| notification-service | M2      | Consumes payment results, sends notifications        |
| api-gateway          | M3      | JWT auth, routing, rate limiting, correlation ID     |

## Quick start

Requirements: Node.js 26 (see `.nvmrc`), pnpm 12, Docker.

```bash
pnpm install
cp .env.example .env          # local placeholders only
docker compose up -d postgres postgres-init kafka kafka-init kafka-ui
                              # Postgres (+ payments DB/role), Kafka (+ topics), UI :8080
pnpm prisma:deploy && pnpm prisma:deploy:payment   # apply both services' migrations
pnpm start:order              # http://localhost:3001/health
pnpm start:payment            # http://localhost:3002/health
```

## Scripts

| Command             | What it does                                           |
| ------------------- | ------------------------------------------------------ |
| `pnpm lint`         | ESLint (typescript-eslint type-checked), zero warnings |
| `pnpm format:check` | Prettier check                                         |
| `pnpm typecheck`    | `tsc --noEmit` over apps and libs                      |
| `pnpm test`         | Unit tests (`*.spec.ts` under `src/`)                  |
| `pnpm test:e2e`     | E2E tests with Supertest (`apps/*/test/*.e2e-spec.ts`) |
| `pnpm build`        | Builds every app into `dist/`                          |

## Layout

```
apps/order-service   Orders REST API + outbox (database: orders)
apps/payment-service Simulated payments (database: payments)
libs/contracts       Versioned event contracts shared by all services
libs/kafka           Producer/consumer wrappers around kafkajs
libs/database        DB interface + readiness check, plugged by each service
libs/outbox          Outbox relay shared by every service
docs/                PRD, architecture, ADRs, learning notes
```
