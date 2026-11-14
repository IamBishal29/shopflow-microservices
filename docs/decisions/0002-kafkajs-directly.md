# 0002. Use KafkaJS directly instead of the Nest Kafka transport

- Status: Accepted
- Date: 2026-11-14

## Context

We need manual control over offset commits, retries with backoff, a dead-letter topic,
idempotent consumers and an outbox relay. `@nestjs/microservices` wraps KafkaJS behind
`@EventPattern` handlers and owns the commit and retry behaviour.

## Decision

Wrap KafkaJS in our own small Nest module (producer and consumer providers with lifecycle
hooks). Handlers stay thin and delegate to services.

## Consequences

- We see and test exactly when an offset is committed relative to the DB transaction,
  which is the core interview topic.
- More wiring code than decorators; we own connection lifecycle and graceful shutdown.
- Alternative considered: Nest Kafka transport (less code, but hides commits and retries).
