import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PaymentFailedV1, PaymentSucceededV1, TOPICS } from '@shopflow/contracts';
import { NewOrder, Order, PageRequest, PaymentOutcome } from './order';
import { orderCreatedEvent } from './order-events';
import { OrderNotFoundError, OrderTotalTooLargeError } from './order.errors';
import { OrdersRepository, PaymentResultOutcome } from './orders.repository';

/** Postgres INTEGER upper bound; orders.total_cents is INTEGER. */
const MAX_TOTAL_CENTS = 2_147_483_647;

export type CreateOrderCommand = Omit<NewOrder, 'totalCents'>;

export interface OrderPage extends PageRequest {
  readonly items: readonly Order[];
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

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

  /**
   * Final saga step: move the order to PAID or PAYMENT_FAILED. A payment failure is the
   * compensation here: the order is rejected, not rolled back. Late, duplicate or
   * out-of-order results never change a final status; they are logged and acknowledged.
   */
  async handlePaymentResult(
    event: PaymentSucceededV1 | PaymentFailedV1,
  ): Promise<PaymentResultOutcome> {
    const { orderId } = event.payload;
    const outcome: PaymentOutcome =
      event.type === TOPICS.paymentSucceeded ? 'PAID' : 'PAYMENT_FAILED';

    const result = await this.orders.applyPaymentResult(event.eventId, orderId, outcome);
    if (result.result === 'applied') {
      this.logger.log(`Order ${orderId} -> ${outcome}`);
    } else if (result.result === 'ignored') {
      this.logger.warn(
        `Ignored ${event.type} ${event.eventId}: order ${orderId} is already ${result.current}`,
      );
    } else {
      this.logger.log(`Duplicate event ${event.eventId} for order ${orderId} skipped`);
    }
    return result;
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
