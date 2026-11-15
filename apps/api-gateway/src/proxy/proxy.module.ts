import { Module } from '@nestjs/common';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { RedisModule } from '../redis/redis.module';
import { DownstreamClient } from './downstream.client';
import { OrdersProxyController } from './orders-proxy.controller';

@Module({
  imports: [RedisModule],
  controllers: [OrdersProxyController],
  providers: [DownstreamClient, IdempotencyService],
})
export class ProxyModule {}
