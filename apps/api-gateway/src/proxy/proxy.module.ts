import { Module } from '@nestjs/common';
import { DownstreamClient } from './downstream.client';
import { OrdersProxyController } from './orders-proxy.controller';

@Module({
  controllers: [OrdersProxyController],
  providers: [DownstreamClient],
})
export class ProxyModule {}
