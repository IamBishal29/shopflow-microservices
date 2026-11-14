import { Logger } from '@nestjs/common';
import { EachMessagePayload, IHeaders, Kafka } from 'kafkajs';
import { IncomingMessage, KafkaConsumerService, nextOffset } from './kafka-consumer.service';
import { KafkaProducerService, OutgoingMessage } from './kafka-producer.service';
import { RetryPolicy } from './retry-policy';

type RunConfig = { autoCommit: boolean; eachMessage: (p: EachMessagePayload) => Promise<void> };
type Handle = (m: IncomingMessage) => Promise<void>;

const policy: RetryPolicy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1_000 };

function fakeConsumer() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    run: jest.fn<Promise<void>, [RunConfig]>().mockResolvedValue(undefined),
    commitOffsets: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
}

function payload(
  topic: string,
  offset: string,
  headers: IHeaders = {},
  heartbeat: jest.Mock = jest.fn().mockResolvedValue(undefined),
): EachMessagePayload {
  return {
    topic,
    partition: 2,
    message: {
      key: Buffer.from('order-1'),
      value: Buffer.from('{"eventId":"e-1"}'),
      offset,
      headers: { 'x-correlation-id': Buffer.from('c-1'), ...headers },
      timestamp: '0',
      attributes: 0,
      size: 0,
    },
    heartbeat,
    pause: jest.fn(),
  } as unknown as EachMessagePayload;
}

async function setup(handle: Handle, isPermanent?: (e: unknown) => boolean) {
  const main = fakeConsumer();
  const retry = fakeConsumer();
  const kafka = {
    consumer: jest.fn(({ groupId }: { groupId: string }) =>
      groupId.endsWith('.retry') ? retry : main,
    ),
  };
  const producer = {
    send: jest.fn<Promise<void>, [string, readonly OutgoingMessage[]]>().mockResolvedValue(),
  };
  const service = new KafkaConsumerService(
    kafka as unknown as Kafka,
    producer as unknown as KafkaProducerService,
  );
  await service.run({
    groupId: 'payment-service',
    topics: ['order.created.v1'],
    handle,
    isPermanent,
    retry: policy,
  });
  const eachMessage = (c: typeof main) => {
    const config = c.run.mock.calls[0]?.[0];
    if (!config) throw new Error('consumer.run was not called');
    return config.eachMessage;
  };
  return {
    kafka,
    main,
    retry,
    producer,
    service,
    onMain: eachMessage(main),
    onRetry: eachMessage(retry),
  };
}

type SendMock = jest.Mock<Promise<void>, [string, readonly OutgoingMessage[]]>;
const sentHeaders = (producer: { send: SendMock }) =>
  producer.send.mock.calls[0]?.[1][0]?.headers ?? {};

describe('KafkaConsumerService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('runs a main consumer and a retry consumer in its own group, both from the oldest event', async () => {
    const { kafka, main, retry } = await setup(jest.fn());
    expect(kafka.consumer).toHaveBeenCalledWith({ groupId: 'payment-service' });
    expect(kafka.consumer).toHaveBeenCalledWith({ groupId: 'payment-service.retry' });
    expect(main.subscribe).toHaveBeenCalledWith({
      topics: ['order.created.v1'],
      fromBeginning: true,
    });
    expect(retry.subscribe).toHaveBeenCalledWith({
      topics: ['order.created.v1.retry'],
      fromBeginning: true,
    });
    expect(main.run.mock.calls[0]?.[0].autoCommit).toBe(false);
  });

  it('passes the decoded message to the handler, then commits the next offset', async () => {
    const handle = jest.fn<Promise<void>, [IncomingMessage]>().mockResolvedValue(undefined);
    const { main, producer, onMain } = await setup(handle);

    await onMain(payload('order.created.v1', '41'));

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'order-1', value: '{"eventId":"e-1"}', offset: '41' }),
    );
    expect(main.commitOffsets).toHaveBeenCalledWith([
      { topic: 'order.created.v1', partition: 2, offset: '42' },
    ]);
    expect(producer.send).not.toHaveBeenCalled();
  });

  it('moves a failed message to the retry topic and keeps the partition flowing', async () => {
    const { main, producer, onMain } = await setup(
      jest.fn().mockRejectedValue(new Error('db down')),
    );
    const before = Date.now();

    await onMain(payload('order.created.v1', '41'));

    expect(producer.send).toHaveBeenCalledWith('order.created.v1.retry', [
      expect.objectContaining({ key: 'order-1', value: '{"eventId":"e-1"}' }),
    ]);
    const headers = sentHeaders(producer);
    expect(headers).toMatchObject({
      'x-retry-attempt': '2',
      'x-original-topic': 'order.created.v1',
      'x-original-partition': '2',
      'x-original-offset': '41',
      'x-error-message': 'db down',
      'x-correlation-id': expect.any(Buffer) as Buffer,
    });
    expect(Number(headers['x-retry-not-before'])).toBeGreaterThanOrEqual(before);
    expect(main.commitOffsets).toHaveBeenCalled();
  });

  it('sends a permanent error straight to the DLQ without retrying', async () => {
    const { producer, onMain } = await setup(
      jest.fn().mockRejectedValue(new TypeError('bad payload')),
      (e) => e instanceof TypeError,
    );
    await onMain(payload('order.created.v1', '41'));
    expect(producer.send).toHaveBeenCalledTimes(1);
    expect(producer.send.mock.calls[0]?.[0]).toBe('order.created.v1.dlq');
    expect(sentHeaders(producer)).toMatchObject({
      'x-retry-attempt': '1',
      'x-error-type': 'TypeError',
    });
  });

  it('retries from the retry topic with the original topic, and dead-letters the last attempt', async () => {
    const handle = jest
      .fn<Promise<void>, [IncomingMessage]>()
      .mockRejectedValue(new Error('db down'));
    const { retry, producer, onRetry } = await setup(handle);
    const retried = payload('order.created.v1.retry', '5', {
      'x-retry-attempt': '3',
      'x-retry-not-before': String(Date.now() - 1),
      'x-original-topic': 'order.created.v1',
      'x-original-partition': '2',
      'x-original-offset': '41',
    });

    await onRetry(retried);

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'order.created.v1', offset: '41' }),
    );
    expect(producer.send.mock.calls[0]?.[0]).toBe('order.created.v1.dlq');
    expect(sentHeaders(producer)).toMatchObject({ 'x-retry-attempt': '3' });
    expect(sentHeaders(producer)).not.toHaveProperty('x-retry-not-before');
    expect(retry.commitOffsets).toHaveBeenCalledWith([
      { topic: 'order.created.v1.retry', partition: 2, offset: '6' },
    ]);
  });

  it('waits until the retry is due, heartbeating meanwhile', async () => {
    jest.useFakeTimers();
    try {
      const handle = jest.fn<Promise<void>, [IncomingMessage]>().mockResolvedValue(undefined);
      const { onRetry } = await setup(handle);
      const heartbeat = jest.fn().mockResolvedValue(undefined);
      const retried = payload(
        'order.created.v1.retry',
        '5',
        { 'x-retry-attempt': '2', 'x-retry-not-before': String(Date.now() + 2_500) },
        heartbeat,
      );

      const done = onRetry(retried);
      await jest.advanceTimersByTimeAsync(2_000);
      expect(handle).not.toHaveBeenCalled();
      expect(heartbeat).toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(600);
      await done;
      expect(handle).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not commit when the hand-off to retry/DLQ fails, so Kafka redelivers', async () => {
    const { main, producer, onMain } = await setup(
      jest.fn().mockRejectedValue(new Error('db down')),
    );
    producer.send.mockRejectedValue(new Error('kafka down'));
    await expect(onMain(payload('order.created.v1', '41'))).rejects.toThrow('kafka down');
    expect(main.commitOffsets).not.toHaveBeenCalled();
  });

  it('disconnects both consumers when the module is destroyed', async () => {
    const { main, retry, service } = await setup(jest.fn());
    await service.onModuleDestroy();
    expect(main.disconnect).toHaveBeenCalled();
    expect(retry.disconnect).toHaveBeenCalled();
  });

  it('computes the next offset without losing precision on large offsets', () => {
    expect(nextOffset('9007199254740993')).toBe('9007199254740994');
  });
});
