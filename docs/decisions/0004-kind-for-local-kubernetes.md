# 0004. Use kind for local Kubernetes

- Status: Accepted
- Date: 2026-11-14

## Context

M5 deploys ShopFlow to a local Kubernetes cluster with Strimzi for Kafka. Options: kind,
minikube.

## Decision

kind (Kubernetes in Docker).

## Consequences

- Fast to create and destroy, runs inside Docker Desktop, and the same tool works in CI.
- Ingress and local images need extra steps (`kind load docker-image`, ingress-nginx
  manifest), which we document.
