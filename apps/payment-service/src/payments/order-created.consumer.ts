import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractViolationError, parseEvent, TOPICS } from '@shopflow/contracts';
import { DEFAULT_RETRY_POLICY, IncomingMessage, KafkaConsumerService } from '@shopflow/kafka';
import { EnvironmentVariables } from '../config/env.validation';
import { PaymentsService } from './payments.service';

/**
 * Thin Kafka handler: decode and validate, then delegate to PaymentsService. Throwing
 * means "not processed": libs/kafka retries it via order.created.v1.retry with backoff,
 * or parks it in order.created.v1.dlq. An invalid payload (ContractViolationError) can
 * never succeed, so it goes to the DLQ at once.
 */
@Injectable()
export class OrderCreatedConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly consumer: KafkaConsumerService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Background start: the service boots (and reports health) while Kafka is down. */
  onApplicationBootstrap(): void {
    this.consumer.runInBackground({
      groupId: this.config.get('KAFKA_GROUP_ID', { infer: true }),
      topics: [TOPICS.orderCreated],
      handle: (message) => this.handle(message),
      isPermanent: (error) => error instanceof ContractViolationError,
      retry: {
        ...DEFAULT_RETRY_POLICY,
        maxAttempts: this.config.get('CONSUMER_MAX_ATTEMPTS', { infer: true }),
        baseDelayMs: this.config.get('CONSUMER_RETRY_BASE_MS', { infer: true }),
      },
    });
  }

  async handle(message: IncomingMessage): Promise<void> {
    await this.payments.handleOrderCreated(parseEvent(TOPICS.orderCreated, message.value));
  }
}
