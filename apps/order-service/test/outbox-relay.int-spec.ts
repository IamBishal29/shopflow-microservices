import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TOPICS } from '@shopflow/contracts';
import { KafkaProducerService } from '@shopflow/kafka';
import { OutboxRelay } from '@shopflow/outbox';
import { Consumer, KafkaMessage } from 'kafkajs';
import { createTopics, eventually, intEnv, kafkaClient } from '../../../test/int/env';
import { EnvironmentVariables } from '../src/config/env.validation';
import { NewOrder } from '../src/orders/order';
import { orderCreatedEvent } from '../src/orders/order-events';
import { OrdersRepository } from '../src/orders/orders.repository';
import { PrismaService } from '../src/prisma/prisma.service';

const config = {
  get: () => intEnv('ordersDb'),
} as unknown as ConfigService<EnvironmentVariables, true>;

const newOrder = (customerId: string, quantity = 1): NewOrder => ({
  customerId,
  currency: 'EUR',
  totalCents: 2500 * quantity,
  items: [{ sku: 'BOOK-1', quantity, unitPriceCents: 2500 }],
});

describe('order-service outbox -> Kafka (real Postgres + Kafka)', () => {
  let prisma: PrismaService;
  let producer: KafkaProducerService;
  let reader: Consumer;
  const received: KafkaMessage[] = [];

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const kafka = kafkaClient('order-service-int');
    const admin = kafka.admin();
    await admin.connect();
    await createTopics(admin, [TOPICS.orderCreated]);
    await admin.disconnect();

    prisma = new PrismaService(config);
    producer = new KafkaProducerService(kafka);
    reader = kafka.consumer({ groupId: 'order-service-int-reader' });
    await reader.connect();
    await reader.subscribe({ topic: TOPICS.orderCreated, fromBeginning: true });
    await reader.run({
      eachMessage: ({ message }) => {
        received.push(message);
        return Promise.resolve();
      },
    });
  });

  afterAll(async () => {
    await reader.disconnect();
    await producer.onApplicationShutdown();
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  const outboxRows = (orderId: string) =>
    prisma.$queryRaw<{ published_at: Date | null }[]>`
      SELECT published_at FROM outbox WHERE aggregate_id = ${orderId}::uuid`;

  it('publishes an order event keyed by order id, marks the row published, and never resends it', async () => {
    const { order } = await new OrdersRepository(prisma).create(newOrder('c-int-1'), (created) =>
      orderCreatedEvent(created, 'corr-int-1'),
    );
    expect(await outboxRows(order.id)).toEqual([{ published_at: null }]);

    const relay = new OutboxRelay(prisma, producer);
    await expect(relay.publishBatch()).resolves.toBe(1);

    await eventually(() => received.some((m) => m.key?.toString() === order.id));
    const message = received.find((m) => m.key?.toString() === order.id);
    expect(JSON.parse(message?.value?.toString() ?? '{}')).toMatchObject({
      type: TOPICS.orderCreated,
      correlationId: 'corr-int-1',
      payload: { orderId: order.id, customerId: 'c-int-1', totalCents: 2500 },
    });
    const [row] = await outboxRows(order.id);
    expect(row?.published_at).toBeInstanceOf(Date);
    await expect(relay.publishBatch()).resolves.toBe(0);
  });

  it('writes neither the order nor its outbox row when the database rejects the order', async () => {
    const before = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM outbox`;
    // quantity 0 violates CHECK order_items_quantity_positive, after the order row is inserted.
    await expect(
      new OrdersRepository(prisma).create(newOrder('c-int-2', 0), (created) =>
        orderCreatedEvent(created, 'corr-int-2'),
      ),
    ).rejects.toThrow();

    const after = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM outbox`;
    expect(after[0]?.n).toBe(before[0]?.n);
    const orders = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM orders WHERE customer_id = 'c-int-2'`;
    expect(orders[0]?.n).toBe(0n);
  });
});
