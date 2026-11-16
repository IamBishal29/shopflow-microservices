import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContractViolationError,
  parseEvent,
  PaymentFailedV1,
  PaymentSucceededV1,
  TOPICS,
} from '@shopflow/contracts';
import { DEFAULT_RETRY_POLICY, IncomingMessage, KafkaConsumerService } from '@shopflow/kafka';
import { DomainError } from '@shopflow/errors';
import { EnvironmentVariables } from '../config/env.validation';
import { OrdersService } from './orders.service';

/**
 * Thin Kafka handler for payment.succeeded.v1 and payment.failed.v1: decode, validate,
 * delegate to OrdersService. Invalid payloads and domain errors (unknown order) can never
 * succeed, so they go to the DLQ at once; anything else is retried by libs/kafka.
 */
@Injectable()
export class PaymentResultsConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly consumer: KafkaConsumerService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Background start: the service boots (and serves HTTP) while Kafka is down. */
  onApplicationBootstrap(): void {
    this.consumer.runInBackground({
      groupId: this.config.get('KAFKA_GROUP_ID', { infer: true }),
      topics: [TOPICS.paymentSucceeded, TOPICS.paymentFailed],
      handle: (message) => this.handle(message),
      isPermanent: (error) =>
        error instanceof ContractViolationError || error instanceof DomainError,
      retry: {
        ...DEFAULT_RETRY_POLICY,
        maxAttempts: this.config.get('CONSUMER_MAX_ATTEMPTS', { infer: true }),
        baseDelayMs: this.config.get('CONSUMER_RETRY_BASE_MS', { infer: true }),
      },
    });
  }

  async handle(message: IncomingMessage): Promise<void> {
    await this.orders.handlePaymentResult(decode(message));
  }
}

function decode(message: IncomingMessage): PaymentSucceededV1 | PaymentFailedV1 {
  if (message.topic === TOPICS.paymentSucceeded) {
    return parseEvent(TOPICS.paymentSucceeded, message.value);
  }
  if (message.topic === TOPICS.paymentFailed) {
    return parseEvent(TOPICS.paymentFailed, message.value);
  }
  throw new ContractViolationError(TOPICS.paymentFailed, [`unexpected topic ${message.topic}`]);
}
