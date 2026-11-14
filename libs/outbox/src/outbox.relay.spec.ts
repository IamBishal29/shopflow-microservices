import { Logger } from '@nestjs/common';
import { KafkaProducerService, OutgoingMessage } from '@shopflow/kafka';
import { TransactionalSqlClient } from '@shopflow/database';
import { OutboxRelay, RELAY } from './outbox.relay';

const row = (id: string, aggregateId: string, type = 'order.created.v1') => ({
  id,
  aggregateId,
  type,
  payload: { eventId: id, type },
});

function setup() {
  const tx = {
    $queryRaw: jest
      .fn<Promise<ReturnType<typeof row>[]>, [TemplateStringsArray, ...unknown[]]>()
      .mockResolvedValue([]),
    $executeRaw: jest
      .fn<Promise<number>, [TemplateStringsArray, ...unknown[]]>()
      .mockResolvedValue(0),
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const producer = {
    send: jest.fn<Promise<void>, [string, OutgoingMessage[]]>().mockResolvedValue(undefined),
  };
  const relay = new OutboxRelay(
    prisma as unknown as TransactionalSqlClient,
    producer as unknown as KafkaProducerService,
  );
  return { tx, prisma, producer, relay };
}

describe('OutboxRelay', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('publishes unpublished rows keyed by aggregate id, then marks them published', async () => {
    const { tx, producer, relay } = setup();
    tx.$queryRaw.mockResolvedValue([row('e-1', 'order-1'), row('e-2', 'order-2')]);

    await expect(relay.publishBatch()).resolves.toBe(2);

    expect(producer.send).toHaveBeenCalledWith('order.created.v1', [
      { key: 'order-1', value: JSON.stringify({ eventId: 'e-1', type: 'order.created.v1' }) },
      { key: 'order-2', value: JSON.stringify({ eventId: 'e-2', type: 'order.created.v1' }) },
    ]);
    const [update, ids] = tx.$executeRaw.mock.calls[0] ?? [];
    expect(update?.join('?')).toMatch(/UPDATE outbox SET published_at = now\(\) WHERE id = ANY/);
    expect(ids).toEqual(['e-1', 'e-2']);
    expect(producer.send.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$executeRaw.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('locks rows with SKIP LOCKED so several relays never send the same row at once', async () => {
    const { tx, relay } = setup();
    await relay.publishBatch();
    const sql = (tx.$queryRaw.mock.calls[0]?.[0] ?? []).join('?');
    expect(sql).toMatch(/WHERE published_at IS NULL[\s\S]*ORDER BY created_at, id/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('sends one Kafka request per topic, keeping creation order inside each topic', async () => {
    const { tx, producer, relay } = setup();
    tx.$queryRaw.mockResolvedValue([
      row('e-1', 'o-1'),
      row('e-2', 'o-1', 'payment.failed.v1'),
      row('e-3', 'o-2'),
    ]);
    await relay.publishBatch();
    expect(producer.send).toHaveBeenCalledTimes(2);
    const keys = (producer.send.mock.calls[0]?.[1] ?? []).map((m) => m.key);
    expect(keys).toEqual(['o-1', 'o-2']);
  });

  it('does not touch Kafka or the table when there is nothing to publish', async () => {
    const { tx, producer, relay } = setup();
    await expect(relay.publishBatch()).resolves.toBe(0);
    expect(producer.send).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('leaves rows unpublished when Kafka is down, so the next poll sends them again', async () => {
    const { tx, producer, relay } = setup();
    tx.$queryRaw.mockResolvedValue([row('e-1', 'order-1')]);
    producer.send.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(relay.publishBatch()).rejects.toThrow('ECONNREFUSED');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('backs off exponentially while Kafka is down and resumes normal polling after', async () => {
    const { tx, producer, relay } = setup();
    tx.$queryRaw.mockResolvedValue([row('e-1', 'order-1')]);
    producer.send.mockRejectedValue(new Error('ECONNREFUSED'));

    const delays: number[] = [];
    for (let i = 0; i < 7; i++) delays.push(await relay.runOnce());
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);

    producer.send.mockResolvedValue(undefined);
    await expect(relay.runOnce()).resolves.toBe(RELAY.idleDelayMs);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('polls again immediately after a full batch to drain a backlog', async () => {
    const { tx, relay } = setup();
    tx.$queryRaw.mockResolvedValue(
      Array.from({ length: RELAY.batchSize }, (_, i) => row(`e-${i}`, `o-${i}`)),
    );
    await expect(relay.runOnce()).resolves.toBe(0);
  });

  it('on shutdown, stops polling and waits for the batch in flight', async () => {
    jest.useFakeTimers();
    try {
      const { prisma, relay } = setup();
      let finishBatch: (value: number) => void = () => undefined;
      prisma.$transaction.mockImplementationOnce(
        () => new Promise((resolve) => (finishBatch = resolve)),
      );

      relay.onApplicationBootstrap();
      jest.advanceTimersByTime(0); // first poll starts and hangs on the DB
      let stopped = false;
      const stopping = relay.onModuleDestroy().then(() => (stopped = true));
      await Promise.resolve();
      expect(stopped).toBe(false);

      finishBatch(0);
      await stopping;
      jest.advanceTimersByTime(RELAY.maxBackoffMs);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
