import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './config/env.validation';

async function bootstrap(): Promise<void> {
  // Config is validated while AppModule initialises: bad env stops the process here.
  const app = await NestFactory.create(AppModule);
  // Run onModuleDestroy / beforeApplicationShutdown hooks on SIGTERM so the Kafka consumer
  // leaves its group and the DB pool closes cleanly when the container stops.
  // useProcessExit: Nest otherwise re-raises the signal to end the process, which does
  // nothing when node is PID 1 in a container (#77). Exit explicitly after the hooks.
  app.enableShutdownHooks([], { useProcessExit: true });

  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  await app.listen(config.get('NOTIFICATION_SERVICE_PORT', { infer: true }));
}

void bootstrap();
