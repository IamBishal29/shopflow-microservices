import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsumerSubscription, IncomingMessage, KafkaConsumerService } from '@shopflow/kafka';
import { EnvironmentVariables } from '../config/env.validation';
import { orderCreated } from './fixtures';
import { OrderCreatedConsumer, START_RETRY_MS } from './order-created.consumer';
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
  const kafka = { run: jest.fn<Promise<void>, [ConsumerSubscription]>() };
  const payments = { handleOrderCreated: jest.fn().mockResolvedValue(null) };
  const config = { get: jest.fn().mockReturnValue('payment-service') };
  const consumer = new OrderCreatedConsumer(
    kafka as unknown as KafkaConsumerService,
    payments as unknown as PaymentsService,
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );
  return { kafka, payments, consumer };
}

describe('OrderCreatedConsumer', () => {
  const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => error.mockClear());
  afterAll(() => jest.restoreAllMocks());

  it('subscribes the payment-service group to order.created.v1', async () => {
    const { kafka, consumer } = setup();
    consumer.onApplicationBootstrap();
    await Promise.resolve();
    expect(kafka.run).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'payment-service', topics: ['order.created.v1'] }),
    );
  });

  it('passes a valid, typed event to PaymentsService', async () => {
    const { payments, consumer } = setup();
    const event = orderCreated();
    await consumer.handle(message(JSON.stringify(event)));
    expect(payments.handleOrderCreated).toHaveBeenCalledWith(event);
  });

  it('skips a malformed message instead of blocking the partition', async () => {
    const { payments, consumer } = setup();
    await expect(consumer.handle(message('{not json'))).resolves.toBeUndefined();
    expect(payments.handleOrderCreated).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('order.created.v1/0@7'));
  });

  it('rethrows processing errors so the offset is not committed and Kafka redelivers', async () => {
    const { payments, consumer } = setup();
    payments.handleOrderCreated.mockRejectedValue(new Error('db down'));
    await expect(consumer.handle(message(JSON.stringify(orderCreated())))).rejects.toThrow(
      'db down',
    );
  });

  it('keeps retrying to start while Kafka is unreachable, and stops on shutdown', async () => {
    jest.useFakeTimers();
    try {
      const { kafka, consumer } = setup();
      kafka.run.mockRejectedValue(new Error('ECONNREFUSED'));

      consumer.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(START_RETRY_MS);
      expect(kafka.run).toHaveBeenCalledTimes(2);

      consumer.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(START_RETRY_MS * 3);
      expect(kafka.run).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
