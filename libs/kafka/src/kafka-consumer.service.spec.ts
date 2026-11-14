import { EachMessagePayload, Kafka } from 'kafkajs';
import { IncomingMessage, KafkaConsumerService, nextOffset } from './kafka-consumer.service';

type RunConfig = { autoCommit: boolean; eachMessage: (p: EachMessagePayload) => Promise<void> };

function setup() {
  const consumer = {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    run: jest.fn<Promise<void>, [RunConfig]>().mockResolvedValue(undefined),
    commitOffsets: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const kafka = { consumer: jest.fn().mockReturnValue(consumer) };
  const service = new KafkaConsumerService(kafka as unknown as Kafka);
  return { kafka, consumer, service };
}

function payload(offset: string): EachMessagePayload {
  return {
    topic: 'order.created.v1',
    partition: 2,
    message: {
      key: Buffer.from('order-1'),
      value: Buffer.from('{"eventId":"e-1"}'),
      offset,
      headers: { 'x-correlation-id': Buffer.from('c-1') },
      timestamp: '0',
      attributes: 0,
      size: 0,
    },
    heartbeat: jest.fn(),
    pause: jest.fn(),
  } as unknown as EachMessagePayload;
}

async function startAndGetHandler(handle: (m: IncomingMessage) => Promise<void>) {
  const ctx = setup();
  await ctx.service.run({ groupId: 'payment-service', topics: ['order.created.v1'], handle });
  const config = ctx.consumer.run.mock.calls[0]?.[0];
  if (!config) throw new Error('consumer.run was not called');
  return { ...ctx, config };
}

describe('KafkaConsumerService', () => {
  it('joins the group and reads from the oldest event when the group is new', async () => {
    const { kafka, consumer, config } = await startAndGetHandler(jest.fn());
    expect(kafka.consumer).toHaveBeenCalledWith({ groupId: 'payment-service' });
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topics: ['order.created.v1'],
      fromBeginning: true,
    });
    expect(config.autoCommit).toBe(false);
  });

  it('passes the decoded message to the handler, then commits the next offset', async () => {
    const handle = jest.fn<Promise<void>, [IncomingMessage]>().mockResolvedValue(undefined);
    const { consumer, config } = await startAndGetHandler(handle);

    await config.eachMessage(payload('41'));

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'order-1', value: '{"eventId":"e-1"}', offset: '41' }),
    );
    expect(consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'order.created.v1', partition: 2, offset: '42' },
    ]);
  });

  it('does not commit when the handler fails, so the message is delivered again', async () => {
    const handle = jest.fn().mockRejectedValue(new Error('db down'));
    const { consumer, config } = await startAndGetHandler(handle);

    await expect(config.eachMessage(payload('41'))).rejects.toThrow('db down');
    expect(consumer.commitOffsets).not.toHaveBeenCalled();
  });

  it('disconnects every consumer when the module is destroyed', async () => {
    const { consumer, service } = await startAndGetHandler(jest.fn());
    await service.onModuleDestroy();
    expect(consumer.disconnect).toHaveBeenCalled();
  });

  it('computes the next offset without losing precision on large offsets', () => {
    expect(nextOffset('9007199254740993')).toBe('9007199254740994');
  });
});
