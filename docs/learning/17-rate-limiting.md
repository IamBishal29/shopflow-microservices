# 17. Rate limiting with a shared Redis store

**In plain words.** Each caller gets a budget, by default 100 requests per 60 s. Request
101 gets **429 Too Many Requests**, a problem+json body and `Retry-After: <seconds>`, and
the caller is blocked for one window. A caller is the verified JWT `sub`, or the client IP
for public routes. The limit protects shared capacity from one client: a retry loop, a
scraper, or a credential-stuffing script.

**Why the store must be shared.** With 3 gateway replicas and in-memory counters, every
pod counts separately, so a client gets 3 × 100 requests and the limit changes whenever
you scale. With the counters in Redis, every replica reads and writes the same number.
Verified live: requests alternating between two replicas, limit 5 → the 6th was 429 on
the replica that had only seen 3.

**Why a Lua script.** "Read count, compare, increment, set expiry" as separate commands
races: two replicas both read 99 and both allow. Redis runs a script atomically, so the
whole decision is one step. Keys are `ratelimit:default:{user:c-42}:hits|block`; the
`{…}` hash tag keeps both keys in one Redis Cluster slot, which multi-key scripts require.

**Algorithms (interview staple):**

| Algorithm      | How                                     | Trade-off                                         |
| -------------- | --------------------------------------- | ------------------------------------------------- |
| Fixed window   | counter per window, reset at the end    | simple, 1 key; up to 2× burst at window edges ←us |
| Sliding log    | timestamp of every request (sorted set) | exact; memory grows with the limit                |
| Sliding window | weighted current + previous counter     | near-exact, 2 keys; the common production choice  |
| Token bucket   | tokens refill at rate r, burst size b   | allows controlled bursts; used by AWS, Stripe     |

**Fail open (Syed's decision).** If Redis is down, requests pass and a warning is logged.
The client is configured to fail fast: no offline queue, 250 ms command timeout, no
retries. Verified live: with Redis stopped, requests took ~3 ms. The trade-off: during
the outage, the limit isn't enforced, but JWT auth still is. A payments or login endpoint
might choose fail closed instead.

```mermaid
flowchart LR
  C[Client] --> G1[gateway pod 1] & G2[gateway pod 2]
  G1 & G2 -->|"EVAL hit script<br/>(atomic)"| R[(Redis<br/>ratelimit:…:{user:c-42})]
  G1 -->|"≤ limit"| O[order-service]
  G2 -->|"> limit: 429 + Retry-After"| C
```

**.NET equivalent.** ASP.NET Core `AddRateLimiter` with `FixedWindowLimiter`,
`SlidingWindowLimiter` or `TokenBucketLimiter`, partitioned by user/IP
(`PartitionedRateLimiter.Create`), with `RejectionStatusCode = 429`. Those limiters are
in-memory per instance; for a shared limit you plug in a Redis-backed limiter (e.g.
`RedisRateLimiting`) or do it at the edge (YARP, Azure API Management, Front Door).

## Interview questions

1. **Fixed window vs sliding window vs token bucket?**
   A fixed window counts per time slot: cheap, but a client can send 2× the limit across a
   boundary. A sliding window weights the previous window, which smooths that edge. A token
   bucket refills tokens at a steady rate and allows bursts up to the bucket size. It is the
   best fit when short bursts are fine but the average rate is not.
2. **Why must the rate-limit store be shared, and why atomic?**
   Per-pod counters multiply the limit by the replica count and change with autoscaling.
   A shared store fixes that, but check-then-increment from several pods races. You need a
   single atomic operation (`INCR`, or a Lua script for multi-step logic).
3. **What happens when Redis is down? Fail open or closed?**
   It is a business choice. Fail open keeps the API available and loses protection
   temporarily; fail closed protects downstreams but turns Redis into a single point of
   failure for every request. Either way, the client must fail fast (timeouts, no command
   queueing), or the outage becomes latency.
