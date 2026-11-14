import {
  DynamicModule,
  InjectionToken,
  Module,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
import { Kafka, logLevel } from 'kafkajs';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaProducerService } from './kafka-producer.service';
import { KAFKA_CLIENT, KAFKA_OPTIONS, KafkaModuleOptions } from './kafka.options';

export interface KafkaModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  readonly inject?: (InjectionToken | OptionalFactoryDependency)[];
  readonly useFactory: (...args: never[]) => KafkaModuleOptions | Promise<KafkaModuleOptions>;
}

/** One Kafka client per service, configured from the service's validated config. */
@Module({})
export class KafkaModule {
  static forRootAsync(options: KafkaModuleAsyncOptions): DynamicModule {
    return {
      module: KafkaModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        { provide: KAFKA_OPTIONS, inject: options.inject ?? [], useFactory: options.useFactory },
        {
          provide: KAFKA_CLIENT,
          inject: [KAFKA_OPTIONS],
          useFactory: (kafka: KafkaModuleOptions) =>
            new Kafka({
              clientId: kafka.clientId,
              brokers: [...kafka.brokers],
              logLevel: logLevel.WARN,
              // Bounded so a missing broker cannot stall a send for minutes.
              retry: { initialRetryTime: 300, retries: 5, maxRetryTime: 5000 },
            }),
        },
        KafkaProducerService,
        KafkaConsumerService,
      ],
      exports: [KafkaProducerService, KafkaConsumerService],
    };
  }
}
