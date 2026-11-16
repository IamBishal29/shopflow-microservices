# 26. Consumer lifecycle belongs in the platform library

**In plain words.** Every Kafka consumer needs the same startup behaviour. Start in the
background so the HTTP server and health checks come up even while Kafka is down. Retry
the connection every few seconds. Stop retrying when the service shuts down. order-service
and payment-service each had a copy of that loop, with its own timer and "stopped" flag.
notification-service (#14) would have been the third copy, so the loop moved into
`KafkaConsumerService.runInBackground(subscription)`. A service's consumer is now only
"these topics, this handler, these errors are permanent".

**Why now, and not earlier.** The rule of three: one copy is code, two is a coincidence,
three is a pattern. With two copies we couldn't yet be sure the shape was really shared;
the third consumer proved it was. Extracting it before adding the third copy means the
fix for any bug (e.g. a timer that outlives shutdown) lands in one place.

**Why "start in the background" at all.** If `onApplicationBootstrap` awaited the Kafka
connection, a Kafka outage would stop the pod from ever passing its readiness check.
Kubernetes would restart it in a loop, and a broker problem would turn into a crashing app.
Booting without Kafka keeps HTTP (and the outbox, which buffers events) working, and the
consumer catches up when Kafka returns. Committed offsets mean nothing is lost meanwhile.

**Shutdown detail.** `onModuleDestroy` sets `stopping` and clears any pending start
timers. Otherwise a timer that fires during shutdown would open a new consumer just as
everything else is closing.

**.NET equivalent.** A `BackgroundService` whose `ExecuteAsync` loops on
`while (!stoppingToken.IsCancellationRequested)` with a retry delay, packaged once in a
shared NuGet library (like MassTransit or Confluent's hosted consumer wrappers) instead of
copied into each service.

## Interview questions

1. **Kafka is down when your service starts. What should happen?**
   The service starts anyway: it serves HTTP and passes liveness, and readiness reflects
   only what the service truly needs. The consumer keeps retrying in the background and
   resumes from the committed offset, so no events are lost, only delayed.
2. **When do you extract shared code into a library in microservices?**
   When it's infrastructure, not business logic (consumer lifecycle, retries, logging),
   and the pattern is proven (the rule of three). Sharing domain code across services
   couples their deploys; sharing plumbing is fine and expected.
3. **How do you test retry timing without waiting in real time?**
   Fake timers (`jest.useFakeTimers` + `advanceTimersByTimeAsync`): advance the clock past
   the retry delay and assert the number of connection attempts, including that none
   happen after shutdown.
