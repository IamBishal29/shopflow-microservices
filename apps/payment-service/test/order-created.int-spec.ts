import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TOPICS } from '@shopflow/contracts';
import {
  dlqTopicOf,
  KafkaConsumerService,
  KafkaProducerService,
  retryTopicOf,
} from '@shopflow/kafka';
import { Admin, Kafka } from 'kafkajs';
import { createTopics, eventually, intEnv, kafkaClient } from '../../../test/int/env';
import { EnvironmentVariables } from '../src/config/env.validation';
import { orderCreated, orderId } from '../src/payments/fixtures';
import { OrderCreatedConsumer } from '../src/payments/order-created.consumer';
import { PaymentsRepository } from '../src/payments/payments.repository';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';

const GROUP = 'payment-service-int';
const topic = TOPICS.orderCreated;

describe('payment-service order.created consumer (real Postgres + Kafka)', () => {
  let kafka: Kafka;
  let admin: Admin;
  let prisma: PrismaService;
  let producer: KafkaProducerService;
  let consumers: KafkaConsumerService;

  beforeAll(async () => {
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    const settings: Record<string, unknown> = {
      PAYMENT_DATABASE_URL: intEnv('paymentsDb'),
      PAYMENT_DECLINE_ABOVE_CENTS: 100_000,
      KAFKA_GROUP_ID: GROUP,
      CONSUMER_MAX_ATTEMPTS: 2,
      CONSUMER_RETRY_BASE_MS: 100,
    };
    const config = {
      get: (key: string) => settings[key],
    } as unknown as ConfigService<EnvironmentVariables, true>;

    kafka = kafkaClient('payment-service-int');
    admin = kafka.admin();
    await admin.connect();
    await createTopics(admin, [topic, retryTopicOf(topic), dlqTopicOf(topic)]);

    prisma = new PrismaService(config);
    producer = new KafkaProducerService(kafka);
    consumers = new KafkaConsumerService(kafka, producer);
    const payments = new PaymentsService(new PaymentsRepository(prisma), config);
    new OrderCreatedConsumer(consumers, payments, config).onApplicationBootstrap();
  });

  afterAll(async () => {
    await consumers.onModuleDestroy();
    await producer.onApplicationShutdown();
    await admin.disconnect();
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  /** True once the group has committed everything currently in the topic. */
  async function caughtUp(): Promise<boolean> {
    const [end] = await admin.fetchTopicOffsets(topic);
    const [group] = await admin.fetchOffsets({ groupId: GROUP, topics: [topic] });
    return group?.partitions[0]?.offset === end?.high;
  }

  it('charges once when the same order.created arrives twice, and dead-letters a malformed one', async () => {
    const event = JSON.stringify(orderCreated(2500));
    await producer.send(topic, [
      { key: orderId, value: event },
      { key: orderId, value: event }, // redelivery: same eventId
      { key: 'poison', value: '{not json' },
    ]);

    await eventually(caughtUp, 30_000);

    const payments = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status FROM payments WHERE order_id = ${orderId}::uuid`;
    expect(payments).toEqual([{ status: 'SUCCEEDED' }]);
    const results = await prisma.$queryRaw<{ type: string }[]>`
      SELECT type FROM outbox WHERE aggregate_id = ${orderId}::uuid`;
    expect(results).toEqual([{ type: TOPICS.paymentSucceeded }]);

    const [dlq] = await admin.fetchTopicOffsets(dlqTopicOf(topic));
    expect(dlq?.high).toBe('1'); // permanent error: straight to the DLQ, no retries
  });
});
