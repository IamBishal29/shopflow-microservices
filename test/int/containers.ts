import { execSync } from 'node:child_process';
import { createServer } from 'node:net';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

/** Same images and tags as docker-compose.yml, so tests run against what we deploy. */
export const IMAGES = {
  postgres: 'postgres:18.7-alpine3.24',
  kafka: 'apache/kafka:4.4.0',
} as const;

export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(IMAGES.postgres).withDatabase('orders').start();
}

/**
 * Single-node KRaft broker from the official apache/kafka image (@testcontainers/kafka only
 * supports Confluent's image). Kafka tells clients which address to use, so the host port
 * must be known BEFORE start: we pick a free port and map it 1:1. The INTERNAL listener is
 * what the broker uses to reach itself inside the container.
 */
export async function startKafka(): Promise<{ container: StartedTestContainer; brokers: string }> {
  const port = await freePort();
  const container = await new GenericContainer(IMAGES.kafka)
    .withExposedPorts({ container: 9092, host: port })
    .withEnvironment({
      KAFKA_NODE_ID: '1',
      KAFKA_PROCESS_ROLES: 'broker,controller',
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@localhost:9093',
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
      KAFKA_LISTENERS: 'INTERNAL://:29092,EXTERNAL://:9092,CONTROLLER://:9093',
      KAFKA_ADVERTISED_LISTENERS: `INTERNAL://localhost:29092,EXTERNAL://localhost:${port}`,
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:
        'INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT',
      KAFKA_INTER_BROKER_LISTENER_NAME: 'INTERNAL',
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false', // as in compose: tests create their topics
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: '1',
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: '0',
    })
    .withWaitStrategy(Wait.forLogMessage(/Kafka Server started/))
    .start();
  return { container, brokers: `localhost:${port}` };
}

/** Applies a service's real migrations with the Prisma CLI, exactly as deploys do. */
export function migrate(service: string, urlVar: string, url: string): void {
  execSync(`pnpm exec prisma migrate deploy --config apps/${service}/prisma.config.ts`, {
    env: { ...process.env, [urlVar]: url },
    stdio: 'pipe', // only shown if it fails (execSync throws with the output)
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}
