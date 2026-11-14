import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Consumer, IHeaders, Kafka } from 'kafkajs';
import { KAFKA_CLIENT } from './kafka.options';

export interface IncomingMessage {
  readonly topic: string;
  readonly partition: number;
  readonly offset: string;
  readonly key: string | null;
  readonly value: string | null;
  readonly headers: IHeaders;
}

export interface ConsumerSubscription {
  /** Consumers sharing a groupId split the partitions; each message goes to one of them. */
  readonly groupId: string;
  readonly topics: readonly string[];
  readonly handle: (message: IncomingMessage) => Promise<void>;
}

/**
 * Runs consumers with at-least-once delivery: the offset is committed only after the
 * handler succeeded. A crash before the commit means the message is delivered again,
 * so handlers must be idempotent (#11). Retries and the dead-letter topic come in #12.
 */
@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private readonly consumers: Consumer[] = [];

  constructor(@Inject(KAFKA_CLIENT) private readonly kafka: Kafka) {}

  async run(subscription: ConsumerSubscription): Promise<void> {
    const consumer = this.kafka.consumer({ groupId: subscription.groupId });
    this.consumers.push(consumer);
    await consumer.connect();
    // Only applies when the group has no committed offset yet (first deploy): start from
    // the oldest retained event instead of silently skipping everything produced earlier.
    await consumer.subscribe({ topics: [...subscription.topics], fromBeginning: true });
    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        await subscription.handle({
          topic,
          partition,
          offset: message.offset,
          key: message.key?.toString('utf8') ?? null,
          value: message.value?.toString('utf8') ?? null,
          headers: message.headers ?? {},
        });
        await consumer.commitOffsets([{ topic, partition, offset: nextOffset(message.offset) }]);
      },
    });
  }

  /**
   * Runs first during shutdown: stop fetching, let in-flight handlers finish, leave the
   * group cleanly (fast rebalance) while the producer and DB pool are still open.
   */
  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.consumers.map((consumer) => consumer.disconnect()));
  }
}

/** Kafka's committed offset is the *next* message to read, not the last one processed. */
export function nextOffset(offset: string): string {
  return (BigInt(offset) + 1n).toString();
}
