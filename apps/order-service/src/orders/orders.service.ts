import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { NewOrder, Order, PageRequest } from './order';
import { orderCreatedEvent } from './order-events';
import { OrderNotFoundError, OrderTotalTooLargeError } from './order.errors';
import { OrdersRepository } from './orders.repository';

/** Postgres INTEGER upper bound; orders.total_cents is INTEGER. */
const MAX_TOTAL_CENTS = 2_147_483_647;

export type CreateOrderCommand = Omit<NewOrder, 'totalCents'>;

export interface OrderPage extends PageRequest {
  readonly items: readonly Order[];
}

@Injectable()
export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  /** Computes the total server-side; a client-supplied total is never trusted. */
  async create(command: CreateOrderCommand): Promise<Order> {
    const totalCents = command.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    );
    if (totalCents > MAX_TOTAL_CENTS) {
      throw new OrderTotalTooLargeError(MAX_TOTAL_CENTS);
    }
    // Placeholder until the gateway forwards a request correlation ID (#15).
    const correlationId = randomUUID();
    return this.orders.create({ ...command, totalCents }, (order) =>
      orderCreatedEvent(order, correlationId),
    );
  }

  async findById(id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order) {
      throw new OrderNotFoundError(id);
    }
    return order;
  }

  async list(page: PageRequest): Promise<OrderPage> {
    const items = await this.orders.list(page);
    return { items, limit: page.limit, offset: page.offset };
  }
}
