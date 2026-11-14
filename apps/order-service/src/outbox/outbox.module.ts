import { Module } from '@nestjs/common';
import { OutboxRelay } from './outbox.relay';

/** Publishes rows written to the outbox table (PrismaService and Kafka are global). */
@Module({ providers: [OutboxRelay] })
export class OutboxModule {}
