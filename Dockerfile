# syntax=docker/dockerfile:1.7
# One image recipe for every ShopFlow service (Syed's choice: shared Dockerfile):
#   docker build --build-arg APP=order-service -t shopflow/order-service .
# APP is one of: api-gateway, order-service, payment-service, notification-service.
#
# Stages: deps (download packages) -> build (compile one app) -> prod-deps (runtime
# packages only) -> runtime (small, non-root). Only the runtime stage ships.

ARG NODE_IMAGE=node:26.13.1-alpine3.24

FROM ${NODE_IMAGE} AS base
# Same pnpm as package.json "packageManager"; Node 26 no longer bundles corepack.
RUN npm install --global pnpm@12.18.0 && npm cache clean --force
WORKDIR /repo

# --- deps: depends only on the lockfile, so source edits never re-download packages ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile --store-dir /pnpm/store

# --- build: all dependencies + source, compile one app -----------------------------------
FROM deps AS build
ARG APP
COPY . .
RUN test -n "${APP}" && test -d "apps/${APP}" \
    || { echo "Set --build-arg APP=<service> (one of: $(ls apps | tr '\n' ' '))" >&2; exit 1; }
# postinstall generates the Prisma clients (TypeScript, compiled into dist by nest build).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --store-dir /pnpm/store \
 && pnpm exec nest build "${APP}"

# --- prod-deps: runtime packages only (no TypeScript, Jest, Prisma CLI, Nest CLI) --------
FROM deps AS prod-deps
# No install scripts: production packages need none, and the Prisma CLI that
# postinstall calls is a dev dependency.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --offline --ignore-scripts --store-dir /pnpm/store

# --- runtime ------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ARG APP
ENV NODE_ENV=production \
    APP_MAIN=apps/${APP}/src/main.js
WORKDIR /app
# Owned by root, read-only for the app user: a compromised process cannot rewrite its code.
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/dist/apps/${APP} ./
# The official image's unprivileged user (uid 1000). Ports are > 1024, so no root needed.
USER node
# exec: node replaces the shell as PID 1 and receives SIGTERM directly, so Nest's shutdown
# hooks run (consumers leave their group, pools close) when Docker or Kubernetes stops it.
CMD ["/bin/sh", "-c", "exec node \"$APP_MAIN\""]
