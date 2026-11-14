import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { PaymentResultsConsumer } from './payment-results.consumer';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, PaymentResultsConsumer],
  exports: [OrdersService],
})
export class OrdersModule {}
