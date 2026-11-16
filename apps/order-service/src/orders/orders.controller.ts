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
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CORRELATION_HEADER, correlationIdOrNew } from '@shopflow/errors';
import type { Response } from 'express';
import { ApiProblemResponses } from '../openapi/problem-details.schema';
import { ApiCustomerIdHeader, CustomerId } from './customer-id.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQuery } from './dto/list-orders.query';
import { OrderPageResponse, OrderResponse } from './dto/order.response';
import { Order } from './order';
import { OrderPage, OrdersService } from './orders.service';

/** Same rule as the gateway: client-chosen, unique per order attempt (e.g. a UUID). */
const VALID_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,255}$/;

/** HTTP mapping only; all rules live in OrdersService. */
@ApiTags('orders')
@ApiHeader({
  name: CORRELATION_HEADER,
  required: false,
  description: 'Trace id from api-gateway; generated when missing or invalid.',
})
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * The gateway's correlation ID becomes the event's, so one ID spans HTTP and Kafka.
   * Optional Idempotency-Key: a repeat answers 201 with the original order and
   * `Idempotent-Replayed: true`, like the first response (Stripe-style).
   */
  @Post()
  @ApiOperation({ summary: 'Create an order (status PENDING) and emit order.created.v1' })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      'Unique per order attempt (1-255 of A-Z a-z 0-9 . _ : -). A repeat returns the original order.',
  })
  @ApiCreatedResponse({
    type: OrderResponse,
    headers: {
      'Idempotent-Replayed': {
        description: 'Present ("true") when an earlier order with this key was returned.',
        schema: { type: 'string', enum: ['true'] },
      },
    },
  })
  @ApiProblemResponses(400, 422, 500)
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
  @ApiOperation({ summary: "Get one of the caller's orders" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCustomerIdHeader()
  @ApiOkResponse({ type: OrderResponse })
  @ApiProblemResponses(400, 401, 404, 500)
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CustomerId() customerId: string,
  ): Promise<Order> {
    return this.orders.findById(id, customerId);
  }

  /** Only the caller's orders. */
  @Get()
  @ApiOperation({ summary: "List the caller's orders, newest first" })
  @ApiCustomerIdHeader()
  @ApiOkResponse({ type: OrderPageResponse })
  @ApiProblemResponses(400, 401, 500)
  list(@Query() query: ListOrdersQuery, @CustomerId() customerId: string): Promise<OrderPage> {
    return this.orders.list(customerId, { limit: query.limit, offset: query.offset });
  }
}
