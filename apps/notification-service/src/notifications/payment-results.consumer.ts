import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractViolationError, parseEvent, TOPICS } from '@shopflow/contracts';
import { DEFAULT_RETRY_POLICY, IncomingMessage, KafkaConsumerService } from '@shopflow/kafka';
import { EnvironmentVariables } from '../config/env.validation';
import type { PaymentResultEvent } from './notification';
import { NotificationsService } from './notifications.service';

/**
 * Thin Kafka handler for payment.succeeded.v1 and payment.failed.v1. Its own consumer
 * group (KAFKA_GROUP_ID, default notification-service) means it receives every event
 * independently of order-service's group: fan-out. Invalid payloads go to the DLQ at once.
 */
@Injectable()
export class PaymentResultsConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly consumer: KafkaConsumerService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Background start: the service boots (and serves health) while Kafka is down. */
  onApplicationBootstrap(): void {
    this.consumer.runInBackground({
      groupId: this.config.get('KAFKA_GROUP_ID', { infer: true }),
      topics: [TOPICS.paymentSucceeded, TOPICS.paymentFailed],
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
    await this.notifications.handlePaymentResult(decode(message));
  }
}

function decode(message: IncomingMessage): PaymentResultEvent {
  if (message.topic === TOPICS.paymentSucceeded) {
    return parseEvent(TOPICS.paymentSucceeded, message.value);
  }
  if (message.topic === TOPICS.paymentFailed) {
    return parseEvent(TOPICS.paymentFailed, message.value);
  }
  throw new ContractViolationError(TOPICS.paymentFailed, [`unexpected topic ${message.topic}`]);
}
