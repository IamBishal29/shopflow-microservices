import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CORRELATION_HEADER, correlationIdOrNew } from '@shopflow/errors';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQuery } from './dto/list-orders.query';
import { Order } from './order';
import { OrderPage, OrdersService } from './orders.service';

/** HTTP mapping only; all rules live in OrdersService. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** The gateway's correlation ID becomes the event's, so one ID spans HTTP and Kafka. */
  @Post()
  create(
    @Body() dto: CreateOrderDto,
    @Headers(CORRELATION_HEADER) correlationId: string | undefined,
  ): Promise<Order> {
    return this.orders.create(dto, correlationIdOrNew(correlationId));
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    return this.orders.findById(id);
  }

  @Get()
  list(@Query() query: ListOrdersQuery): Promise<OrderPage> {
    return this.orders.list({ limit: query.limit, offset: query.offset });
  }
}
