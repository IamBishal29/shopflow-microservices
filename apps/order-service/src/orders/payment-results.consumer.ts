import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContractViolationError,
  parseEvent,
  PaymentFailedV1,
  PaymentSucceededV1,
  TOPICS,
} from '@shopflow/contracts';
import { DEFAULT_RETRY_POLICY, IncomingMessage, KafkaConsumerService } from '@shopflow/kafka';
import { DomainError } from '../common/errors/domain-error';
import { EnvironmentVariables } from '../config/env.validation';
import { OrdersService } from './orders.service';

export const START_RETRY_MS = 5_000;

/**
 * Thin Kafka handler for payment.succeeded.v1 and payment.failed.v1: decode, validate,
 * delegate to OrdersService. Invalid payloads and domain errors (unknown order) can never
 * succeed, so they go to the DLQ at once; anything else is retried by libs/kafka.
 */
@Injectable()
export class PaymentResultsConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PaymentResultsConsumer.name);
  private retryTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly consumer: KafkaConsumerService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Starts in the background so the service boots (and serves HTTP) while Kafka is down. */
  onApplicationBootstrap(): void {
    void this.start();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
  }

  async handle(message: IncomingMessage): Promise<void> {
    await this.orders.handlePaymentResult(decode(message));
  }

  private async start(): Promise<void> {
    try {
      await this.consumer.run({
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
      this.logger.log(`Consuming ${TOPICS.paymentSucceeded}, ${TOPICS.paymentFailed}`);
    } catch (error) {
      if (this.stopped) return;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Kafka consumer did not start, retrying in ${START_RETRY_MS} ms: ${reason}`);
      this.retryTimer = setTimeout(() => void this.start(), START_RETRY_MS);
    }
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
