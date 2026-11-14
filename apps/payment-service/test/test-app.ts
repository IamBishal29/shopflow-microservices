import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { KafkaConsumerService, KafkaProducerService } from '@shopflow/kafka';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/** Fakes for Kafka so e2e tests never need (or wait for) a broker. */
export const kafkaFakes = {
  producer: { send: jest.fn(), onModuleInit: jest.fn(), onApplicationShutdown: jest.fn() },
  consumer: { run: jest.fn(), onModuleDestroy: jest.fn() },
};

/**
 * Boots payment-service's real AppModule with infrastructure swapped out.
 * Each test file adds its own overrides, e.g. for PrismaService or a repository.
 */
export async function createTestApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(KafkaProducerService)
    .useValue(kafkaFakes.producer)
    .overrideProvider(KafkaConsumerService)
    .useValue(kafkaFakes.consumer);
  const moduleRef = await configure(builder).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}
