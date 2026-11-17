import { Client } from 'pg';
import { migrate, startKafka, startPostgres } from './containers';
import { INT_ENV } from './env';

/**
 * Runs once before all integration tests: one Postgres (a database per service, as in
 * production) and one Kafka broker for the whole run. Starting containers per test file
 * would cost ~10 s each; tests isolate themselves with their own topics/groups instead.
 * Workers inherit process.env, so the addresses are passed that way.
 */
export default async function globalSetup(): Promise<void> {
  const [postgres, kafka] = await Promise.all([startPostgres(), startKafka()]);
  globalThis.__INT_CONTAINERS__ = [postgres, kafka.container];

  const ordersUrl = postgres.getConnectionUri();
  const paymentsUrl = ordersUrl.replace(/\/orders$/, '/payments');
  const admin = new Client({ connectionString: ordersUrl });
  await admin.connect();
  await admin.query('CREATE DATABASE payments');
  await admin.end();

  migrate('order-service', 'ORDER_DATABASE_URL', ordersUrl);
  migrate('payment-service', 'PAYMENT_DATABASE_URL', paymentsUrl);

  process.env[INT_ENV.ordersDb] = ordersUrl;
  process.env[INT_ENV.paymentsDb] = paymentsUrl;
  process.env[INT_ENV.kafkaBrokers] = kafka.brokers;
}
