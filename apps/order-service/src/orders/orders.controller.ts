import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { CORRELATION_HEADER, correlationIdOrNew } from '@shopflow/errors';
import type { Response } from 'express';
import { CustomerId } from './customer-id.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQuery } from './dto/list-orders.query';
import { Order } from './order';
import { OrderPage, OrdersService } from './orders.service';

/** Same rule as the gateway: client-chosen, unique per order attempt (e.g. a UUID). */
const VALID_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,255}$/;

/** HTTP mapping only; all rules live in OrdersService. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * The gateway's correlation ID becomes the event's, so one ID spans HTTP and Kafka.
   * Optional Idempotency-Key: a repeat answers 201 with the original order and
   * `Idempotent-Replayed: true`, like the first response (Stripe-style).
   */
  @Post()
  async create(
    @Body() dto: CreateOrderDto,
    @Headers(CORRELATION_HEADER) correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Order> {
    if (idempotencyKey !== undefined && !VALID_IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be 1-255 letters, digits or ._:-');
    }
    const { order, replayed } = await this.orders.create(
      dto,
      correlationIdOrNew(correlationId),
      idempotencyKey,
    );
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return order;
  }

  /** Another customer's order answers 404, like a missing one: existence is not leaked. */
  @Get(':id')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CustomerId() customerId: string,
  ): Promise<Order> {
    return this.orders.findById(id, customerId);
  }

  /** Only the caller's orders. */
  @Get()
  list(@Query() query: ListOrdersQuery, @CustomerId() customerId: string): Promise<OrderPage> {
    return this.orders.list(customerId, { limit: query.limit, offset: query.offset });
  }
}
