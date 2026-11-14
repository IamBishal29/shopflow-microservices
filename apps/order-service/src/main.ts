import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Port is fixed until the config issue (M1) adds @nestjs/config with schema validation.
const PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Run onModuleDestroy / beforeApplicationShutdown hooks on SIGTERM so DB pools
  // and Kafka consumers close cleanly when Docker or Kubernetes stops the container.
  app.enableShutdownHooks();
  await app.listen(PORT);
}

void bootstrap();
