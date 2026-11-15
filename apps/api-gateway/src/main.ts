import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './config/env.validation';

async function bootstrap(): Promise<void> {
  // Config is validated while AppModule initialises: bad env stops the process here.
  const app = await NestFactory.create(AppModule);
  // Close the HTTP server cleanly on SIGTERM (rolling deploys, scale-down).
  app.enableShutdownHooks();

  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  await app.listen(config.get('GATEWAY_PORT', { infer: true }));
}

void bootstrap();
