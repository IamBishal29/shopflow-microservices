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

## Amendment (2026-11-14, issue #7): client library risk

**Finding.** `kafkajs` has had no release since 2.2.4 (Feb 2023) and no commit since
Aug 2024. On Node 26 it prints a harmless `TimeoutNegativeWarning` (its request queue
computes a negative timer; Node clamps it to 1 ms).

**Considered.** Confluent's official `@confluentinc/kafka-javascript` (maintained,
librdkafka-based, KafkaJS-compatible API). Its prebuilt binaries stop at Node 24 (ABI 137);
on Node 26 it must be compiled from source, which needs C++ build tools locally, in CI and
in Docker images.

**Decision.** Keep `kafkajs` 2.2.4 for now, hidden behind `libs/kafka`
(`KafkaProducerService`, `KafkaConsumerService`). Services never import `kafkajs`.

**Revisit when** Confluent ships Node 26 prebuilts, or a kafkajs bug affects us. Because
the Confluent client exposes a KafkaJS-compatible API and only `libs/kafka` touches it, the
switch is local to that library.

**Producer retry note.** kafkajs warns that bounded retries can weaken idempotence. We keep
them bounded (5 retries, max 5 s) so a send fails fast while Kafka is down; durability
comes from the transactional outbox (#9), and duplicates across relay retries are absorbed
by idempotent consumers (#11).
