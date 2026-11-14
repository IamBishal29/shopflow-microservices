# 0005. Use the Nest CLI monorepo

- Status: Accepted
- Date: 2026-11-14

## Context

Four apps and a shared contracts library live in one repo. Options: Nest CLI monorepo, Nx.

## Decision

Nest CLI monorepo mode: `apps/*` and `libs/*`, one root `package.json`, path alias
`@shopflow/contracts`.

## Consequences

- Simple and official; one lockfile and one set of tool versions.
- No task caching or affected-only builds; CI builds everything. At four services that is
  seconds. Nx becomes worth it with many more projects or slow builds.
- All services share dependency versions, which is simpler but couples upgrades.
