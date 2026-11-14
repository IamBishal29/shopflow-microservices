import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { IHeaders, Kafka, Partitioners, Producer } from 'kafkajs';
import { KAFKA_CLIENT } from './kafka.options';

export interface OutgoingMessage {
  /** Partition key. Use the aggregate ID (e.g. orderId) so one aggregate's events stay ordered. */
  readonly key: string | null;
  /** null only when forwarding an empty message unchanged (retry/DLQ). */
  readonly value: string | null;
  readonly headers?: IHeaders;
}

/**
 * Shared producer for the whole service (one connection, many sends).
 * Idempotent with acks=all: a retried send cannot create a duplicate in the log, and a
 * send only succeeds once every in-sync replica has the message.
 */
@Injectable()
export class KafkaProducerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly producer: Producer;
  private connecting: Promise<void> | undefined;

  constructor(@Inject(KAFKA_CLIENT) kafka: Kafka) {
    this.producer = kafka.producer({
      idempotent: true,
      // With idempotence, >1 in-flight request could reorder retried batches in KafkaJS.
      maxInFlightRequests: 1,
      createPartitioner: Partitioners.DefaultPartitioner, // murmur2, same as the Java client
    });
  }

  /**
   * Start connecting in the background: HTTP startup is not blocked by Kafka retries, and
   * the service still starts if Kafka is down (the next send retries the connection).
   */
  onModuleInit(): void {
    this.ensureConnected().catch((error: unknown) => {
      this.logger.warn(`Kafka not reachable at startup; will retry on send: ${describe(error)}`);
    });
  }

  async send(topic: string, messages: readonly OutgoingMessage[]): Promise<void> {
    await this.ensureConnected();
    await this.producer.send({ topic, acks: -1, messages: [...messages] });
  }

  /** Runs last during shutdown, after consumers have stopped and finished in-flight work. */
  async onApplicationShutdown(): Promise<void> {
    await this.producer.disconnect();
  }

  private ensureConnected(): Promise<void> {
    this.connecting ??= this.producer.connect().catch((error: unknown) => {
      this.connecting = undefined; // allow the next call to try again
      throw error;
    });
    return this.connecting;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
