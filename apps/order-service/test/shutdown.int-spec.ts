import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TOPICS } from '@shopflow/contracts';
import { retryTopicOf } from '@shopflow/kafka';
import { Kafka, logLevel } from 'kafkajs';
import type { StartedTestContainer } from 'testcontainers';
import { startKafka } from '../../../test/int/containers';
import { createTopics, eventually, intEnv } from '../../../test/int/env';

const GROUP = 'order-service-shutdown-int';
const TOPICS_CONSUMED = [TOPICS.paymentSucceeded, TOPICS.paymentFailed];

/**
 * The whole order-service (real consumers, outbox relay, producer, Prisma) shutting down.
 * Own Kafka container: this file stops it, and the shared one serves the other test files.
 */
describe('order-service graceful shutdown (real Postgres + Kafka)', () => {
  let kafka: StartedTestContainer;
  let admin: ReturnType<Kafka['admin']>;

  beforeAll(async () => {
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    // kafkajs logs connection errors to the console once the broker is stopped.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const started = await startKafka();
    kafka = started.container;
    admin = new Kafka({ brokers: [started.brokers], logLevel: logLevel.NOTHING }).admin();
    await admin.connect();
    await createTopics(admin, [...TOPICS_CONSUMED, ...TOPICS_CONSUMED.map(retryTopicOf)]);

    // ConfigModule validates the environment when AppModule is imported, as at startup.
    process.env.ORDER_DATABASE_URL = intEnv('ordersDb');
    process.env.KAFKA_BROKERS = started.brokers;
    process.env.KAFKA_GROUP_ID = GROUP;
  });

  afterAll(async () => {
    await admin.disconnect().catch(() => undefined);
    await kafka.stop().catch(() => undefined); // already stopped by the last test
    jest.restoreAllMocks();
  });

  async function startApp(): Promise<INestApplication> {
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    // Both consumers (main + retry) joined their groups: the state a real deploy stops in.
    await eventually(async () => {
      const { groups } = await admin.describeGroups([GROUP, `${GROUP}.retry`]);
      return groups.every((group) => group.state === 'Stable');
    }, 30_000);
    return app;
  }

  async function timeClose(app: INestApplication): Promise<number> {
    const started = Date.now();
    await app.close();
    return Date.now() - started;
  }

  it('stops in about a second while Kafka is up (consumers leave their groups)', async () => {
    const app = await startApp();
    expect(await timeClose(app)).toBeLessThan(1_500);
  });

  it('still stops within the 10 s Docker grace period after Kafka went away', async () => {
    const app = await startApp();
    await admin.disconnect();
    await kafka.stop();

    expect(await timeClose(app)).toBeLessThan(10_000);
  });
});
