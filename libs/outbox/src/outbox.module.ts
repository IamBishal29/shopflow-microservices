import { Module } from '@nestjs/common';
import { OutboxRelay } from './outbox.relay';

/**
 * Publishes the service's outbox rows to Kafka. Needs DatabaseModule.forRoot and
 * KafkaModule.forRootAsync in the importing app (both global).
 */
@Module({ providers: [OutboxRelay] })
export class OutboxModule {}
