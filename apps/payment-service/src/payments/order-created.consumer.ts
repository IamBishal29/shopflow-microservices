import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractViolationError, parseEvent, TOPICS } from '@shopflow/contracts';
import { IncomingMessage, KafkaConsumerService } from '@shopflow/kafka';
import { EnvironmentVariables } from '../config/env.validation';
import { PaymentsService } from './payments.service';

export const START_RETRY_MS = 5_000;

/**
 * Thin Kafka handler: decode and validate, then delegate to PaymentsService. Throwing
 * means "not processed": the offset is not committed and Kafka delivers the message again.
 */
@Injectable()
export class OrderCreatedConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrderCreatedConsumer.name);
  private retryTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly consumer: KafkaConsumerService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Starts in the background so the service boots (and reports health) while Kafka is down. */
  onApplicationBootstrap(): void {
    void this.start();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
  }

  async handle(message: IncomingMessage): Promise<void> {
    let event;
    try {
      event = parseEvent(TOPICS.orderCreated, message.value);
    } catch (error) {
      if (!(error instanceof ContractViolationError)) throw error;
      // A malformed message can never succeed; retrying would block this partition forever.
      // Skip it (offset gets committed). #12 replaces this with a dead-letter topic.
      this.logger.error(
        `Skipping invalid message ${message.topic}/${message.partition}@${message.offset}: ${error.message}`,
      );
      return;
    }
    await this.payments.handleOrderCreated(event);
  }

  private async start(): Promise<void> {
    try {
      await this.consumer.run({
        groupId: this.config.get('KAFKA_GROUP_ID', { infer: true }),
        topics: [TOPICS.orderCreated],
        handle: (message) => this.handle(message),
      });
      this.logger.log(`Consuming ${TOPICS.orderCreated}`);
    } catch (error) {
      if (this.stopped) return;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Kafka consumer did not start, retrying in ${START_RETRY_MS} ms: ${reason}`);
      this.retryTimer = setTimeout(() => void this.start(), START_RETRY_MS);
    }
  }
}
