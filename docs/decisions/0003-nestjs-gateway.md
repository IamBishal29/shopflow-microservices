# 0003. Build api-gateway as a NestJS app

- Status: Accepted
- Date: 2026-11-14

## Context

The edge needs JWT validation, routing to order-service, rate limiting, correlation IDs,
response caching and idempotency keys. Options: a NestJS proxy app, or Kong/Traefik.

## Decision

A NestJS application using guards (JWT), interceptors (correlation ID, cache), a Redis-backed
throttler and an HTTP proxy to downstream services.

## Consequences

- Each cross-cutting concern is code we write, test and can explain.
- In production, many teams put Kong/Envoy/an API management product here; we will say so
  in interviews and explain what we would hand off to it.
- The gateway is one more service to run and scale.
