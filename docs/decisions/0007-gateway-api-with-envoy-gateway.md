# 0007. Gateway API with Envoy Gateway as the cluster edge

- Status: Accepted
- Date: 2026-11-17
- Amends: 0004 (its "ingress-nginx manifest" consequence)

## Context

#26 asks for ingress-nginx to expose the api-gateway on kind. The Kubernetes project
archived ingress-nginx in March 2026: no releases, no security fixes. The edge is the
most exposed component, so unpatched software there is a real risk, and an interviewer
would likely point it out. The successor standard is the **Gateway API**
(`gateway.networking.k8s.io/v1`): GatewayClass, Gateway and HTTPRoute, with roles split
between the platform, the cluster operator and the app team. It also brings richer routing
(header matching, traffic splitting) without controller-specific annotations.

Options: Gateway API with Envoy Gateway; Traefik as a classic Ingress controller;
ingress-nginx anyway.

## Decision

Gateway API, implemented by **Envoy Gateway** (CNCF Envoy project), pinned to release
v1.9.3 (installs the Gateway API CRDs v1.6.1). Syed chose this option.

- `deploy/envoy-gateway`: controller from the pinned release URL.
- `deploy/k8s/edge.yaml`: GatewayClass, Gateway (HTTP listener for `shopflow.localhost`),
  HTTPRoute to `api-gateway` only.
- On kind the proxy Service is a NodePort (30080) mapped to `127.0.0.1:8088`. In a cloud
  cluster it would be a LoadBalancer.

## Consequences

- It's the standard the ecosystem is moving to, and routes are portable across
  implementations (Envoy Gateway, Istio, Cilium, NGINX Gateway Fabric, cloud gateways).
- The Envoy-specific settings (`EnvoyProxy`: the NodePort) are isolated in one object
  referenced by the Gateway.
- One more operator-style controller to run and upgrade, like Strimzi.
- TLS isn't configured locally. In production it terminates at the Gateway listener
  (cert-manager), see learning note 37.
