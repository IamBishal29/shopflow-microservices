# 0006. Non-blocking retries via retry topics, then a dead-letter topic

- Status: Accepted
- Date: 2026-11-14

## Context

A consumer handler can fail transiently (DB down, timeout) or permanently (invalid
payload). Retrying in place blocks the whole partition (head-of-line blocking): every
later order waits behind one failing message. Never retrying loses work.

## Decision

`libs/kafka` routes failures, per subscription:

- Transient error and attempts left: publish to `<topic>.retry` with headers
  `x-retry-attempt`, `x-retry-not-before` (exponential backoff, full jitter),
  `x-original-*` and `x-error-*`; commit the original offset.
- A second consumer (group `<group>.retry`) waits until `not-before`, then runs the same
  handler. It is a separate consumer so its waiting never blocks the main topic.
- Permanent error (`isPermanent`, e.g. `ContractViolationError`) or attempts exhausted:
  publish to `<topic>.dlq` with the same headers; commit.
- If publishing to retry/DLQ fails, nothing is committed and Kafka redelivers.

Policy comes from config (`CONSUMER_MAX_ATTEMPTS`, `CONSUMER_RETRY_BASE_MS`).

## Consequences

- One bad message never stalls a partition.
- **Per-key ordering is lost for retried messages**: a retried event can be handled after
  newer events for the same order. Acceptable because handlers are idempotent (#11) and
  order status only moves forward from `PENDING` (#13).
- One retry topic for all delays: a message with a long delay can hold up shorter ones
  behind it in the retry partition (extra delay, never lost). Production systems often use
  one retry topic per delay tier (`.retry.5s`, `.retry.1m`).
- Alternative considered: blocking in-process retries (keeps ordering, no extra topics,
  but the partition pauses during retries).
- DLQ replay: after fixing the cause, re-publish the DLQ message's key and value to the
  source topic; idempotent consumers make a repeated replay harmless.
