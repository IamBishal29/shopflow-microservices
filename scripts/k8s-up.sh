#!/usr/bin/env bash
# Builds the app images, loads them into a local kind cluster and applies deploy/k8s.
# Idempotent: re-run after a code change to rebuild, reload and roll the pods.
# Needs: docker, kind, kubectl. Usage: scripts/k8s-up.sh
set -euo pipefail

CLUSTER=shopflow
NAMESPACE=shopflow
TAG=dev
APPS=(api-gateway order-service payment-service notification-service)
cd "$(dirname "$0")/.."

# Secrets come from gitignored files; fail early instead of deploying placeholders.
for app in "${APPS[@]}"; do
  if [[ ! -f "deploy/k8s/secrets/$app.env" ]]; then
    echo "Missing deploy/k8s/secrets/$app.env: copy $app.env.example and fill it in." >&2
    exit 1
  fi
done

if ! kind get clusters | grep -qx "$CLUSTER"; then
  kind create cluster --config deploy/kind/cluster.yaml
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

# kind nodes can't see the host's Docker images; `kind load` copies them into the node.
for app in "${APPS[@]}"; do
  docker build --quiet --build-arg APP="$app" -t "shopflow/$app:$TAG" . >/dev/null
  kind load docker-image --name "$CLUSTER" "shopflow/$app:$TAG"
done

existing=$(kubectl -n "$NAMESPACE" get deployments -o name 2>/dev/null || true)
kubectl apply -k deploy/k8s
# Re-run with the same tag: the Deployment spec is unchanged, so restart to pick up the
# freshly loaded image. (On the first run the pods start with it anyway.)
if [[ -n "$existing" ]]; then
  kubectl -n "$NAMESPACE" rollout restart deployment
fi
kubectl -n "$NAMESPACE" get pods
