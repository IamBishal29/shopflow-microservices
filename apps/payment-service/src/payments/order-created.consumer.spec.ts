import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractViolationError } from '@shopflow/contracts';
import { ConsumerSubscription, IncomingMessage, KafkaConsumerService } from '@shopflow/kafka';
import { EnvironmentVariables } from '../config/env.validation';
import { orderCreated } from './fixtures';
import { OrderCreatedConsumer } from './order-created.consumer';
import { PaymentsService } from './payments.service';

const message = (value: string | null): IncomingMessage => ({
  topic: 'order.created.v1',
  partition: 0,
  offset: '7',
  key: 'order-1',
  value,
  headers: {},
});

function setup() {
  const kafka = { runInBackground: jest.fn<void, [ConsumerSubscription]>() };
  const payments = { handleOrderCreated: jest.fn().mockResolvedValue(null) };
  const values: Record<string, unknown> = {
    KAFKA_GROUP_ID: 'payment-service',
    CONSUMER_MAX_ATTEMPTS: 5,
    CONSUMER_RETRY_BASE_MS: 200,
  };
  const config = { get: jest.fn((key: string) => values[key]) };
  const consumer = new OrderCreatedConsumer(
    kafka as unknown as KafkaConsumerService,
    payments as unknown as PaymentsService,
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );
  return { kafka, payments, consumer };
}

describe('OrderCreatedConsumer', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('subscribes the payment-service group to order.created.v1 with the configured retries', () => {
    const { kafka, consumer } = setup();
    consumer.onApplicationBootstrap();
    expect(kafka.runInBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'payment-service',
        topics: ['order.created.v1'],
        retry: expect.objectContaining({ maxAttempts: 5, baseDelayMs: 200 }) as object,
      }),
    );
  });

  it('treats contract violations as permanent (DLQ at once) and other errors as transient', () => {
    const { kafka, consumer } = setup();
    consumer.onApplicationBootstrap();
    const isPermanent = kafka.runInBackground.mock.calls[0]?.[0].isPermanent;
    expect(isPermanent?.(new ContractViolationError('order.created.v1', ['x']))).toBe(true);
    expect(isPermanent?.(new Error('db down'))).toBe(false);
  });

  it('passes a valid, typed event to PaymentsService', async () => {
    const { payments, consumer } = setup();
    const event = orderCreated();
    await consumer.handle(message(JSON.stringify(event)));
    expect(payments.handleOrderCreated).toHaveBeenCalledWith(event);
  });

  it('rejects a malformed message with a ContractViolationError and never charges', async () => {
    const { payments, consumer } = setup();
    await expect(consumer.handle(message('{not json'))).rejects.toBeInstanceOf(
      ContractViolationError,
    );
    expect(payments.handleOrderCreated).not.toHaveBeenCalled();
  });

  it('rethrows processing errors so libs/kafka can retry them', async () => {
    const { payments, consumer } = setup();
    payments.handleOrderCreated.mockRejectedValue(new Error('db down'));
    await expect(consumer.handle(message(JSON.stringify(orderCreated())))).rejects.toThrow(
      'db down',
    );
  });
});
