import { Logger } from '@nestjs/common';
import { ContractViolationError } from '@shopflow/contracts';
import { ConfigService } from '@nestjs/config';
import { ConsumerSubscription, IncomingMessage, KafkaConsumerService } from '@shopflow/kafka';
import { EnvironmentVariables } from '../config/env.validation';
import { notificationFor } from './notification';
import { NotificationSender } from './notification-sender';
import { NotificationsRepository, SendOutcome } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { orderId, paymentFailed, paymentSucceeded } from './payment-event.fixtures';
import { PaymentResultsConsumer } from './payment-results.consumer';

function setupService(outcome: SendOutcome = 'sent') {
  const repository = {
    recordAndSend: jest.fn(
      async (_n: unknown, _channel: string, deliver: () => Promise<void>): Promise<SendOutcome> => {
        if (outcome === 'sent') await deliver();
        return outcome;
      },
    ),
  };
  const send = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
  const sender: NotificationSender = { channel: 'log', send };
  const service = new NotificationsService(
    repository as unknown as NotificationsRepository,
    sender,
  );
  return { repository, send, service };
}

describe('NotificationsService', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  it('records and sends the notification through the configured channel', async () => {
    const { repository, send, service } = setupService();

    await expect(service.handlePaymentResult(paymentSucceeded)).resolves.toBe('sent');

    const expected = notificationFor(paymentSucceeded);
    expect(repository.recordAndSend).toHaveBeenCalledWith(expected, 'log', expect.any(Function));
    expect(send).toHaveBeenCalledWith(expected);
  });

  it('does not send again for an event that was already notified', async () => {
    const { send, service } = setupService('duplicate');
    await expect(service.handlePaymentResult(paymentFailed)).resolves.toBe('duplicate');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('PaymentResultsConsumer', () => {
  const message = (topic: string, value: string | null): IncomingMessage => ({
    topic,
    partition: 0,
    offset: '5',
    key: orderId,
    value,
    headers: {},
  });

  function setupConsumer() {
    const kafka = { runInBackground: jest.fn<void, [ConsumerSubscription]>() };
    const notifications = { handlePaymentResult: jest.fn().mockResolvedValue('sent') };
    const values: Record<string, unknown> = {
      KAFKA_GROUP_ID: 'notification-service',
      CONSUMER_MAX_ATTEMPTS: 4,
      CONSUMER_RETRY_BASE_MS: 1_000,
    };
    const consumer = new PaymentResultsConsumer(
      kafka as unknown as KafkaConsumerService,
      notifications as unknown as NotificationsService,
      { get: (key: string) => values[key] } as unknown as ConfigService<EnvironmentVariables, true>,
    );
    consumer.onApplicationBootstrap();
    const subscription = kafka.runInBackground.mock.calls[0]?.[0];
    if (!subscription) throw new Error('runInBackground was not called');
    return { notifications, consumer, subscription };
  }

  it('subscribes its own group to both payment result topics (fan-out)', () => {
    const { subscription } = setupConsumer();
    expect(subscription.groupId).toBe('notification-service');
    expect(subscription.topics).toEqual(['payment.succeeded.v1', 'payment.failed.v1']);
    expect(subscription.retry).toMatchObject({ maxAttempts: 4, baseDelayMs: 1_000 });
  });

  it('decodes each topic with its own contract and delegates', async () => {
    const { notifications, consumer } = setupConsumer();
    await consumer.handle(message('payment.succeeded.v1', JSON.stringify(paymentSucceeded)));
    await consumer.handle(message('payment.failed.v1', JSON.stringify(paymentFailed)));
    expect(notifications.handlePaymentResult).toHaveBeenNthCalledWith(1, paymentSucceeded);
    expect(notifications.handlePaymentResult).toHaveBeenNthCalledWith(2, paymentFailed);
  });

  it('rejects a malformed event as permanent (DLQ at once) and never notifies', async () => {
    const { notifications, consumer, subscription } = setupConsumer();
    const error: unknown = await consumer
      .handle(message('payment.failed.v1', '{"oops":1}'))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContractViolationError);
    expect(subscription.isPermanent?.(error)).toBe(true);
    expect(subscription.isPermanent?.(new Error('db down'))).toBe(false);
    expect(notifications.handlePaymentResult).not.toHaveBeenCalled();
  });
});
