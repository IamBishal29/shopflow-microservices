# 07. Transactional outbox: solving the dual-write problem

**In plain words.** Creating an order must do two things: save it in Postgres and tell
Kafka. There is no transaction that spans both, so any order of the two can break:

- DB commit, then publish → the process crashes in between: order saved, event **lost**,
  payment never happens.
- Publish, then DB commit → the commit fails: payment-service charges an order that
  **does not exist**.

The outbox makes it one write: the event goes into an `outbox` table **in the same DB
transaction** as the order. A separate relay reads unpublished rows and publishes them.
Either both rows exist or neither does; the relay just has to keep trying.

**How ShopFlow does it.**

- `OrdersRepository.create`: one interactive Prisma transaction inserts order, items
  and the outbox row (`id` = `eventId`, `aggregate_id` = orderId, `payload` = envelope).
- `OutboxRelay` (polling): in one transaction, `SELECT … WHERE published_at IS NULL
ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`, send to Kafka (`acks=all`,
  key = orderId), set `published_at`, commit.
- **SKIP LOCKED** lets several order-service replicas run the relay: each one takes rows
  the others have not locked, nobody waits.
- **Kafka down?** The send throws, the transaction rolls back, rows stay unpublished,
  the relay backs off 1 s → 2 s → … → 30 s and resumes. The API keeps accepting orders.
  (Verified live: an order created while Kafka was stopped was published once on restart.)
- **At-least-once.** If the process dies after Kafka acked but before the commit, the
  batch is sent again. Consumers deduplicate on `eventId` (#11).
- **Shutdown.** The relay stops in `onModuleDestroy` and waits for the batch in flight,
  before the producer and Prisma close in `onApplicationShutdown`.

```mermaid
sequenceDiagram
  participant API as POST /orders
  participant DB as Postgres
  participant R as OutboxRelay
  participant K as Kafka
  API->>DB: BEGIN; insert order + items + outbox row; COMMIT
  loop every 1 s (backoff when failing)
    R->>DB: BEGIN; SELECT … FOR UPDATE SKIP LOCKED
    R->>K: send(order.created.v1, key=orderId) acks=all
    R->>DB: UPDATE published_at; COMMIT
  end
```

| Concept          | ShopFlow                               | .NET analogue                                     |
| ---------------- | -------------------------------------- | ------------------------------------------------- |
| Outbox write     | Prisma `$transaction` (order + outbox) | EF Core `SaveChanges` with an `OutboxMessage` set |
| Relay            | `OutboxRelay` with `setTimeout` loop   | `BackgroundService` polling loop                  |
| Library approach | hand-written (~100 lines)              | MassTransit / NServiceBus transactional outbox    |
| CDC alternative  | Debezium reading the Postgres WAL      | Debezium, or SQL Server CDC + a connector         |

**Trade-offs we accepted.** Row locks are held during the Kafka send (bounded by a 30 s
transaction timeout); published rows are kept (a cleanup job is future work); ordering
is per relay instance, which is enough while each order produces one outbox event.

## Interview questions

1. **Why not publish to Kafka right after the DB commit?** That is a dual write: a crash
   or Kafka outage between the two steps loses the event forever (or, the other way
   round, publishes an event for a rolled-back order). The outbox turns it into one
   local transaction plus a retryable relay.
2. **Polling relay vs CDC (Debezium)?** Polling: simple, no extra infrastructure, but adds
   DB load and latency (poll interval). CDC tails the write-ahead log: near-real-time, no
   polling queries, but needs Kafka Connect + Debezium to run and monitor, and the WAL
   format couples you to the DB. Start with polling; move to CDC at high volume.
3. **Does the outbox give exactly-once?** No, at-least-once: a crash after the broker ack
   and before marking the row resends it. Pair it with idempotent consumers
   (processed-event table keyed by `eventId`) for effectively-once processing.
