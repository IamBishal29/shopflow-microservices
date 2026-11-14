# 11. Idempotent consumers: effectively-once on top of at-least-once

**In plain words.** Kafka delivers at least once. The dangerous moment is a crash
**after** the handler's DB transaction committed but **before** the offset commit: Kafka
redelivers, and a naive handler charges the customer twice. An idempotent consumer
remembers which events it already handled, in the **same transaction** as the side
effect, so a redelivery becomes a no-op. At-least-once delivery + idempotent handler =
"effectively once" processing.

**How ShopFlow does it.**

- `processed_events (event_id, consumer)` in each consuming service's own database.
  `consumer` in the key lets two handlers in one service each process an event once.
- `claimEvent(tx, eventId, consumer)` (libs/database):
  `INSERT … ON CONFLICT DO NOTHING`; 0 rows inserted = duplicate.
  Not "insert and catch the unique violation": in Postgres any error aborts the
  transaction, so nothing else could run in it afterwards.
- `PaymentsRepository.record`: claim → payment → outbox row, one transaction. Duplicate
  → return null, handler returns normally, offset gets committed.
- Order of commits: DB commit first, then offset commit (in `libs/kafka`). The reverse
  would lose messages on a crash (at-most-once).
- Second line of defense: unique `payments.order_id` (business key).

**Verified live** (the interview scenario): stopped payment-service, reset its consumer
group to the earliest offset (as if no offset was ever committed), restarted: 9 events
redelivered, 9 skipped, 0 new payments, counts unchanged, lag 0.

```mermaid
sequenceDiagram
  participant K as Kafka
  participant H as payment handler
  participant DB as payments DB
  K->>H: order.created.v1 (eventId E)
  H->>DB: BEGIN; INSERT processed_events(E) ON CONFLICT DO NOTHING
  alt first time (1 row)
    H->>DB: INSERT payment + outbox row; COMMIT
  else duplicate (0 rows)
    H->>DB: COMMIT (nothing else)
  end
  H->>K: commit offset (next)
  Note over H,K: crash before this line = redelivery, handled by the alt branch
```

| Concept               | ShopFlow                                  | .NET analogue                                    |
| --------------------- | ----------------------------------------- | ------------------------------------------------ |
| Dedup store           | `processed_events` table                  | NServiceBus/MassTransit inbox (`InboxState`)     |
| Insert-if-absent      | `ON CONFLICT DO NOTHING`                  | `MERGE` / catch `DbUpdateException` (SQL Server) |
| Same-transaction rule | claim + side effect in one `$transaction` | `TransactionScope` / one `SaveChanges`           |

**Trade-offs.** The table grows forever; production adds a retention job (delete rows
older than Kafka's retention, after which no redelivery is possible).

## Interview questions

1. **Is Kafka exactly-once enough here?** No. Kafka transactions give exactly-once only
   for read-from-Kafka/write-to-Kafka pipelines. Our side effect is a Postgres write, which
   Kafka cannot include in its transaction, so we need an idempotent consumer.
2. **What if the process crashes after the DB commit but before the offset commit?** The
   message is redelivered; `processed_events` already has the eventId, so the handler
   commits nothing new and the offset moves on. No double charge.
3. **Why store processed IDs in the same DB transaction, not in Redis?** Two stores
   cannot commit atomically: a crash between them either loses the marker (duplicate
   side effect) or keeps it without the side effect (lost work). One transaction avoids
   both.
