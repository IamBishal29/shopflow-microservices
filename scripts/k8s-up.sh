#!/usr/bin/env bash
# Builds the images, loads them into a local kind cluster, installs the Strimzi operator
# and Envoy Gateway, and applies deploy/k8s (edge, data stores, Kafka, migrations,
# the four services).
# Idempotent: re-run after a code change to rebuild, reload and roll the pods.
# Needs: docker, kind, kubectl. Usage: scripts/k8s-up.sh
set -euo pipefail

CLUSTER=shopflow
NAMESPACE=shopflow
TAG=dev
APPS=(api-gateway order-service payment-service notification-service)
cd "$(dirname "$0")/.."

# Secrets come from gitignored files; fail early instead of deploying placeholders.
for app in "${APPS[@]}" postgres; do
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
docker build --quiet --target migrate -t "shopflow/migrate:$TAG" . >/dev/null
kind load docker-image --name "$CLUSTER" "shopflow/migrate:$TAG"

# The operator first: the Kafka/KafkaTopic kinds only exist once its CRDs are registered.
# Server-side apply: the CRDs are too big for the client-side last-applied annotation.
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl apply --server-side -k deploy/strimzi >/dev/null
kubectl wait --for=condition=Established --timeout=60s   crd/kafkas.kafka.strimzi.io crd/kafkanodepools.kafka.strimzi.io crd/kafkatopics.kafka.strimzi.io
kubectl -n "$NAMESPACE" rollout status deployment/strimzi-cluster-operator --timeout=180s
# Same for the edge: Gateway API CRDs + Envoy Gateway controller (ADR 0007).
kubectl apply --server-side -k deploy/envoy-gateway >/dev/null
kubectl wait --for=condition=Established --timeout=60s   crd/gateways.gateway.networking.k8s.io crd/httproutes.gateway.networking.k8s.io   crd/envoyproxies.gateway.envoyproxy.io
kubectl -n envoy-gateway-system rollout status deployment/envoy-gateway --timeout=180s

existing=$(kubectl -n "$NAMESPACE" get deployment "${APPS[@]}" -o name 2>/dev/null || true)
# A finished Job never runs again: recreate the migration Jobs so every deploy migrates.
kubectl -n "$NAMESPACE" delete job -l app.kubernetes.io/component=migration --ignore-not-found
kubectl apply -k deploy/k8s
# Re-run with the same tag: the Deployment spec is unchanged, so restart to pick up the
# freshly loaded image. (On the first run the pods start with it anyway.)
if [[ -n "$existing" ]]; then
  kubectl -n "$NAMESPACE" rollout restart deployment "${APPS[@]}"
fi

echo "Waiting for Kafka (the operator needs a minute or two on first start)..."
kubectl -n "$NAMESPACE" wait kafka/shopflow --for=condition=Ready --timeout=300s
kubectl -n "$NAMESPACE" wait job -l app.kubernetes.io/component=migration   --for=condition=Complete --timeout=300s
for app in "${APPS[@]}"; do
  kubectl -n "$NAMESPACE" rollout status deployment "$app" --timeout=180s
done
kubectl -n "$NAMESPACE" wait gateway/shopflow --for=condition=Programmed --timeout=180s
kubectl -n "$NAMESPACE" get pods
echo "Gateway: http://shopflow.localhost:8088 (try /health)"
