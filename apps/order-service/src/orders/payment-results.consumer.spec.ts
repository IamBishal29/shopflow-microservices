import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractViolationError } from '@shopflow/contracts';
import { ConsumerSubscription, IncomingMessage, KafkaConsumerService } from '@shopflow/kafka';
import { EnvironmentVariables } from '../config/env.validation';
import { OrderNotFoundError } from './order.errors';
import { OrdersService } from './orders.service';
import { paidOrderId, paymentFailed, paymentSucceeded } from './payment-event.fixtures';
import { PaymentResultsConsumer } from './payment-results.consumer';

const message = (topic: string, value: string | null): IncomingMessage => ({
  topic,
  partition: 0,
  offset: '3',
  key: paidOrderId,
  value,
  headers: {},
});

function setup() {
  const kafka = { run: jest.fn<Promise<void>, [ConsumerSubscription]>() };
  const orders = { handlePaymentResult: jest.fn().mockResolvedValue({ result: 'applied' }) };
  const values: Record<string, unknown> = {
    KAFKA_GROUP_ID: 'order-service',
    CONSUMER_MAX_ATTEMPTS: 4,
    CONSUMER_RETRY_BASE_MS: 1_000,
  };
  const config = { get: jest.fn((key: string) => values[key]) };
  const consumer = new PaymentResultsConsumer(
    kafka as unknown as KafkaConsumerService,
    orders as unknown as OrdersService,
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );
  return { kafka, orders, consumer };
}

async function subscription() {
  const ctx = setup();
  ctx.consumer.onApplicationBootstrap();
  await Promise.resolve();
  const sub = ctx.kafka.run.mock.calls[0]?.[0];
  if (!sub) throw new Error('run was not called');
  return { ...ctx, sub };
}

describe('PaymentResultsConsumer', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('subscribes the order-service group to both payment result topics', async () => {
    const { sub } = await subscription();
    expect(sub.groupId).toBe('order-service');
    expect(sub.topics).toEqual(['payment.succeeded.v1', 'payment.failed.v1']);
  });

  it('decodes each topic with its own contract and delegates to OrdersService', async () => {
    const { orders, consumer } = setup();
    await consumer.handle(message('payment.succeeded.v1', JSON.stringify(paymentSucceeded)));
    await consumer.handle(message('payment.failed.v1', JSON.stringify(paymentFailed)));
    expect(orders.handlePaymentResult).toHaveBeenNthCalledWith(1, paymentSucceeded);
    expect(orders.handlePaymentResult).toHaveBeenNthCalledWith(2, paymentFailed);
  });

  it('rejects a payment.failed payload sent to the payment.succeeded topic', async () => {
    const { orders, consumer } = setup();
    await expect(
      consumer.handle(message('payment.succeeded.v1', JSON.stringify(paymentFailed))),
    ).rejects.toBeInstanceOf(ContractViolationError);
    expect(orders.handlePaymentResult).not.toHaveBeenCalled();
  });

  it('sends invalid payloads and unknown orders to the DLQ, and retries anything else', async () => {
    const { sub } = await subscription();
    expect(sub.isPermanent?.(new ContractViolationError('payment.failed.v1', ['x']))).toBe(true);
    expect(sub.isPermanent?.(new OrderNotFoundError(paidOrderId))).toBe(true);
    expect(sub.isPermanent?.(new Error('db down'))).toBe(false);
  });
});
