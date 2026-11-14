import { Module } from '@nestjs/common';
import { OrderCreatedConsumer } from './order-created.consumer';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  providers: [OrderCreatedConsumer, PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
