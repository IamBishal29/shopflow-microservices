import { Admin, Kafka, logLevel } from 'kafkajs';
import type { StartedTestContainer } from 'testcontainers';

declare global {
  var __INT_CONTAINERS__: StartedTestContainer[] | undefined;
}

/** Variables global-setup sets for the test workers (never read by the apps themselves). */
export const INT_ENV = {
  ordersDb: 'INT_ORDER_DATABASE_URL',
  paymentsDb: 'INT_PAYMENT_DATABASE_URL',
  kafkaBrokers: 'INT_KAFKA_BROKERS',
} as const;

export function intEnv(name: keyof typeof INT_ENV): string {
  const value = process.env[INT_ENV[name]];
  if (!value) throw new Error(`${INT_ENV[name]} not set: run via \`pnpm test:int\``);
  return value;
}

export function kafkaClient(clientId: string): Kafka {
  return new Kafka({ clientId, brokers: [intEnv('kafkaBrokers')], logLevel: logLevel.NOTHING });
}

export async function createTopics(admin: Admin, topics: readonly string[]): Promise<void> {
  await admin.createTopics({
    waitForLeaders: true,
    topics: topics.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
  });
}

/**
 * Polls `check` until it returns true; integration tests wait on real async systems.
 * A throwing check counts as "not yet" (e.g. a fresh broker has no group coordinator for
 * the first seconds); the last error is reported if time runs out.
 */
export async function eventually(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) {
      throw new Error(`condition not met within ${timeoutMs} ms`, { cause: lastError });
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
