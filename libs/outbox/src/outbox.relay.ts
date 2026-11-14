import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DATABASE, TransactionalSqlClient } from '@shopflow/database';
import { KafkaProducerService, OutgoingMessage } from '@shopflow/kafka';

interface OutboxRow {
  readonly id: string;
  readonly aggregateId: string;
  readonly type: string;
  readonly payload: unknown;
}

/** Tuning knobs. Constants for now; move to config if they ever need to differ per env. */
export const RELAY = {
  batchSize: 100,
  idleDelayMs: 1_000,
  maxBackoffMs: 30_000,
  // Must outlast a Kafka send with its retries; the row locks are held meanwhile.
  transactionTimeoutMs: 30_000,
} as const;

/**
 * Polls the outbox and publishes unpublished rows to Kafka (topic = row.type,
 * key = aggregateId). Delivery is at-least-once: if the process dies after Kafka acked
 * but before the commit, the batch is sent again. Consumers deduplicate on eventId (#11).
 *
 * Works with any service whose database has the standard `outbox` table
 * (id uuid, aggregate_id uuid, type text, payload jsonb, created_at, published_at).
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = false;
  private failureDelayMs = 0;

  constructor(
    @Inject(DATABASE) private readonly db: TransactionalSqlClient,
    private readonly producer: KafkaProducerService,
  ) {}

  onApplicationBootstrap(): void {
    this.schedule(0);
  }

  /** Stop polling and let the current batch finish before Kafka and the DB pool close. */
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
  }

  /** One poll. Returns how long to wait before the next one. */
  async runOnce(): Promise<number> {
    try {
      const published = await this.publishBatch();
      if (this.failureDelayMs > 0) this.logger.log('Outbox relay recovered');
      this.failureDelayMs = 0;
      // A full batch means there is probably more backlog: drain it without waiting.
      return published === RELAY.batchSize ? 0 : RELAY.idleDelayMs;
    } catch (error) {
      this.failureDelayMs = Math.min(
        Math.max(this.failureDelayMs * 2, RELAY.idleDelayMs),
        RELAY.maxBackoffMs,
      );
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Outbox publish failed, retrying in ${this.failureDelayMs} ms: ${reason}`);
      return this.failureDelayMs;
    }
  }

  /** Lock a batch, send it, mark it published; all in one DB transaction. */
  async publishBatch(): Promise<number> {
    return this.db.$transaction(
      async (tx) => {
        // SKIP LOCKED: another relay instance takes the next rows instead of waiting.
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, aggregate_id AS "aggregateId", type, payload
          FROM outbox
          WHERE published_at IS NULL
          ORDER BY created_at, id
          LIMIT ${RELAY.batchSize}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return 0;

        for (const [topic, messages] of groupByTopic(rows)) {
          await this.producer.send(topic, messages);
        }
        const ids = rows.map((row) => row.id);
        await tx.$executeRaw`
          UPDATE outbox SET published_at = now() WHERE id = ANY(${ids}::uuid[])`;
        return rows.length;
      },
      { timeout: RELAY.transactionTimeoutMs },
    );
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.runOnce().then((next) => {
        this.inFlight = undefined;
        this.schedule(next);
      });
    }, delayMs);
  }
}

/** Keeps creation order within each topic, so one order's events stay in sequence. */
function groupByTopic(rows: readonly OutboxRow[]): Map<string, OutgoingMessage[]> {
  const byTopic = new Map<string, OutgoingMessage[]>();
  for (const row of rows) {
    const messages = byTopic.get(row.type) ?? [];
    messages.push({ key: row.aggregateId, value: JSON.stringify(row.payload) });
    byTopic.set(row.type, messages);
  }
  return byTopic;
}
