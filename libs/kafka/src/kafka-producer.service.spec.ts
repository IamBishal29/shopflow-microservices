import { Logger } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { KafkaProducerService } from './kafka-producer.service';
import { SHUTDOWN_STEP_TIMEOUT_MS } from './shutdown';

function setup() {
  const producer = {
    connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue([]),
    disconnect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  };
  const kafka = { producer: jest.fn().mockReturnValue(producer) };
  const service = new KafkaProducerService(kafka as unknown as Kafka);
  return { kafka, producer, service };
}

describe('KafkaProducerService', () => {
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  afterEach(() => warn.mockClear());
  afterAll(() => warn.mockRestore());

  it('creates an idempotent producer that keeps batches in order', () => {
    const { kafka } = setup();
    expect(kafka.producer).toHaveBeenCalledWith(
      expect.objectContaining({ idempotent: true, maxInFlightRequests: 1 }),
    );
  });

  it('sends with acks=all and connects only once for many sends', async () => {
    const { producer, service } = setup();
    const message = { key: 'order-1', value: '{}' };

    await service.send('order.created.v1', [message]);
    await service.send('order.created.v1', [message]);

    expect(producer.connect).toHaveBeenCalledTimes(1);
    expect(producer.send).toHaveBeenCalledWith({
      topic: 'order.created.v1',
      acks: -1,
      messages: [message],
    });
  });

  it('starts even when Kafka is down, and retries the connection on the next send', async () => {
    const { producer, service } = setup();
    producer.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    service.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve)); // let the background connect settle
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));

    await service.send('order.created.v1', [{ key: 'order-1', value: '{}' }]);
    expect(producer.connect).toHaveBeenCalledTimes(2);
    expect(producer.send).toHaveBeenCalledTimes(1);
  });

  it('disconnects on application shutdown', async () => {
    const { producer, service } = setup();
    await service.onApplicationShutdown();
    expect(producer.disconnect).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('gives up on disconnect after the step timeout while Kafka is unreachable', async () => {
    jest.useFakeTimers();
    try {
      const { producer, service } = setup();
      producer.disconnect.mockReturnValue(new Promise(() => undefined)); // stuck in retries

      const stopping = service.onApplicationShutdown();
      await jest.advanceTimersByTimeAsync(SHUTDOWN_STEP_TIMEOUT_MS);
      await stopping;

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not disconnect'));
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects sends once shutdown has started, without opening a new connection', async () => {
    const { producer, service } = setup();
    await service.onApplicationShutdown();

    await expect(service.send('order.created.v1', [{ key: 'o-1', value: '{}' }])).rejects.toThrow(
      'shutting down',
    );
    expect(producer.connect).not.toHaveBeenCalled();
  });
});
