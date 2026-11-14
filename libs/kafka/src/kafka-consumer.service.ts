import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Consumer, EachMessagePayload, IHeaders, Kafka } from 'kafkajs';
import { KafkaProducerService } from './kafka-producer.service';
import { KAFKA_CLIENT } from './kafka.options';
import {
  DEFAULT_RETRY_POLICY,
  describeError,
  dlqTopicOf,
  FAILURE_HEADERS as H,
  numberHeader,
  RetryPolicy,
  retryTopicOf,
  routeFailure,
} from './retry-policy';

export interface IncomingMessage {
  /** Always the original topic, also when the message is being retried. */
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
  /** Throw to signal failure. Return normally once the message is fully handled. */
  readonly handle: (message: IncomingMessage) => Promise<void>;
  /** Errors that can never succeed (e.g. invalid payload): straight to the DLQ, no retries. */
  readonly isPermanent?: (error: unknown) => boolean;
  readonly retry?: RetryPolicy;
}

/** Thrown inside a retry wait when the service shuts down; the message is redelivered later. */
class ConsumerStoppingError extends Error {
  override readonly name = 'ConsumerStoppingError';
}

/**
 * At-least-once consumers with non-blocking retries:
 *
 *   <topic>        main consumer (group G)        handler fails -> <topic>.retry
 *   <topic>.retry  retry consumer (group G.retry)  waits until x-retry-not-before, retries
 *   <topic>.dlq    after maxAttempts or a permanent error (with x-error-* headers)
 *
 * The offset is committed only after the handler succeeded or the message was handed to
 * the retry/DLQ topic. If that hand-off fails, nothing is committed and Kafka redelivers.
 * The main partition never stalls on a failing message; the price is that a retried
 * message can be processed after newer messages with the same key.
 */
@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly consumers: Consumer[] = [];
  private stopping = false;

  constructor(
    @Inject(KAFKA_CLIENT) private readonly kafka: Kafka,
    private readonly producer: KafkaProducerService,
  ) {}

  async run(subscription: ConsumerSubscription): Promise<void> {
    const policy = subscription.retry ?? DEFAULT_RETRY_POLICY;
    // Two consumers: a retry waiting for its delay must not hold up the main topic
    // (kafkajs handles one message at a time per consumer).
    await Promise.all([
      this.start(subscription.groupId, subscription.topics, (payload) =>
        this.attempt(toIncoming(payload), 1, subscription, policy),
      ),
      this.start(
        `${subscription.groupId}.retry`,
        subscription.topics.map(retryTopicOf),
        async (payload) => {
          const headers = payload.message.headers ?? {};
          await this.waitUntil(numberHeader(headers, H.notBefore, 0), () => payload.heartbeat());
          const attempt = numberHeader(headers, H.attempt, 2);
          await this.attempt(fromRetry(payload), attempt, subscription, policy);
        },
      ),
    ]);
  }

  /**
   * Runs first during shutdown: stop fetching, let in-flight handlers finish (retry waits
   * are cut short), and leave the groups cleanly while the producer and DB are still open.
   */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await Promise.all(this.consumers.map((consumer) => consumer.disconnect()));
  }

  private async start(
    groupId: string,
    topics: readonly string[],
    process: (payload: EachMessagePayload) => Promise<void>,
  ): Promise<void> {
    const consumer = this.kafka.consumer({ groupId });
    this.consumers.push(consumer);
    await consumer.connect();
    // Only applies when the group has no committed offset yet (first deploy): start from
    // the oldest retained event instead of silently skipping everything produced earlier.
    await consumer.subscribe({ topics: [...topics], fromBeginning: true });
    await consumer.run({
      autoCommit: false,
      eachMessage: async (payload) => {
        await process(payload);
        const { topic, partition, message } = payload;
        await consumer.commitOffsets([{ topic, partition, offset: nextOffset(message.offset) }]);
      },
    });
  }

  /** One try of the handler; on failure, hand the message to the retry or DLQ topic. */
  private async attempt(
    message: IncomingMessage,
    attempt: number,
    subscription: ConsumerSubscription,
    policy: RetryPolicy,
  ): Promise<void> {
    try {
      await subscription.handle(message);
      return;
    } catch (error) {
      if (error instanceof ConsumerStoppingError) throw error;
      const route = routeFailure(attempt, subscription.isPermanent?.(error) ?? false, policy);
      const { type, message: text } = describeError(error);
      const where = `${message.topic}/${message.partition}@${message.offset}`;
      const headers: IHeaders = {
        ...message.headers,
        [H.originalTopic]: message.topic,
        [H.originalPartition]: String(message.partition),
        [H.originalOffset]: message.offset,
        [H.errorType]: type,
        [H.errorMessage]: text,
        [H.failedAt]: new Date().toISOString(),
      };

      if (route.to === 'retry') {
        headers[H.attempt] = String(route.nextAttempt);
        headers[H.notBefore] = String(Date.now() + route.delayMs);
        await this.producer.send(retryTopicOf(message.topic), [
          { key: message.key, value: message.value, headers },
        ]);
        this.logger.warn(
          `${where} attempt ${attempt} failed (${type}: ${text}); retry ${route.nextAttempt} in ${route.delayMs} ms`,
        );
      } else {
        headers[H.attempt] = String(attempt);
        delete headers[H.notBefore]; // left over from the retry topic; meaningless in the DLQ
        await this.producer.send(dlqTopicOf(message.topic), [
          { key: message.key, value: message.value, headers },
        ]);
        this.logger.error(
          `${where} sent to ${dlqTopicOf(message.topic)} (${route.reason}) after attempt ${attempt}: ${type}: ${text}`,
        );
      }
    }
  }

  /** Sleeps until `notBefore` in short steps, heartbeating so the group keeps this member. */
  private async waitUntil(notBefore: number, heartbeat: () => Promise<void>): Promise<void> {
    while (Date.now() < notBefore) {
      if (this.stopping) throw new ConsumerStoppingError('consumer is shutting down');
      await sleep(Math.min(notBefore - Date.now(), 1_000));
      await heartbeat();
    }
  }
}

function toIncoming({ topic, partition, message }: EachMessagePayload): IncomingMessage {
  return {
    topic,
    partition,
    offset: message.offset,
    key: message.key?.toString('utf8') ?? null,
    value: message.value?.toString('utf8') ?? null,
    headers: message.headers ?? {},
  };
}

/** A retry-topic message, described as the original message it stands for. */
function fromRetry(payload: EachMessagePayload): IncomingMessage {
  const incoming = toIncoming(payload);
  const header = (name: string): string | undefined => {
    const raw = incoming.headers[name];
    return Buffer.isBuffer(raw) ? raw.toString('utf8') : typeof raw === 'string' ? raw : undefined;
  };
  return {
    ...incoming,
    topic: header(H.originalTopic) ?? payload.topic.replace(/\.retry$/, ''),
    partition: numberHeader(incoming.headers, H.originalPartition, payload.partition),
    offset: header(H.originalOffset) ?? incoming.offset,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
}

/** Kafka's committed offset is the *next* message to read, not the last one processed. */
export function nextOffset(offset: string): string {
  return (BigInt(offset) + 1n).toString();
}
