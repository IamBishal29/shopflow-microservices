# 0001. Technology stack

- Status: Accepted
- Date: 2026-11-14

## Context

ShopFlow is a learning and interview-demo project. It must use free, open-source tools that
Node.js backend teams actually use, and run on a laptop.

## Decision

- **Runtime**: Node.js 26 (Active LTS), pnpm 12.
- **Framework**: NestJS 12 in a Nest CLI monorepo (see 0005), TypeScript 6 with `strict`.
  TypeScript 7 (the native Go compiler) is not used yet because ts-jest and
  typescript-eslint still need the JS compiler API (`<7` and `<6.1` peer ranges).
- **Module format**: our code compiles to CommonJS. NestJS 12 ships ESM-only packages, which
  Node 26 loads through native `require(esm)`. Jest runs with `--experimental-vm-modules`
  so its runtime can do the same.
- **Data**: PostgreSQL 18 + Prisma, one database per service.
- **Messaging**: Kafka in KRaft mode (`apache/kafka` image) via KafkaJS (see 0002).
- **Cache and limits**: Redis (official image).
- **Testing**: Jest, Supertest, Testcontainers.
- **Delivery**: Docker Compose locally; kind + Strimzi for Kubernetes (see 0004);
  GitHub Actions CI.
- **Observability**: nestjs-pino, @nestjs/terminus, OpenTelemetry + Jaeger.

## Consequences

- Everything is free and runs offline after the first image pull.
- CommonJS + `require(esm)` keeps imports simple (no `.js` suffixes) but relies on a Node 22+
  feature; moving to full ESM later is a mechanical change.
- The Jest flag prints an "experimental" warning; it is harmless. Vitest is the alternative
  if Jest's ESM support becomes a problem.
