import { Injectable } from '@nestjs/common';
import type { EventEnvelope, Topic } from '@shopflow/contracts';
import { claimEvent } from '@shopflow/database';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NewOrder, Order, OrderStatus, PageRequest, PaymentOutcome } from './order';
import { OrderNotFoundError } from './order.errors';

type OrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>;
type OutboxEvent = EventEnvelope<Topic, unknown>;

/** Name under which the payment-results handler records processed events. */
export const PAYMENT_RESULTS_CONSUMER = 'order-service.payment-results';

export type PaymentResultOutcome =
  | { readonly result: 'applied' }
  | { readonly result: 'duplicate' }
  | { readonly result: 'ignored'; readonly current: OrderStatus };

/** Persistence for orders. The only class in order-service that talks to Prisma about orders. */
@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Transactional outbox: the order, its items and its event row commit together or not
   * at all. Kafka is never called here; OutboxRelay publishes the row later.
   */
  async create(order: NewOrder, toEvent: (created: Order) => OutboxEvent): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.order.create({
        data: {
          customerId: order.customerId,
          currency: order.currency,
          totalCents: order.totalCents,
          items: {
            create: order.items.map((item) => ({
              sku: item.sku,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
            })),
          },
        },
        include: { items: true },
      });
      const created = toOrder(row);
      const event = toEvent(created);
      await tx.outboxEvent.create({
        data: {
          id: event.eventId,
          aggregateId: created.id,
          type: event.type,
          // Envelope is plain JSON data (strings, numbers, arrays), stored as-is.
          payload: event as unknown as Prisma.InputJsonObject,
        },
      });
      return created;
    });
  }

  /**
   * One transaction: mark the event processed, then move the order PENDING -> outcome with
   * a conditional UPDATE (compare-and-set). The WHERE status = 'PENDING' makes the check
   * and the write one atomic step, so two concurrent results cannot both win.
   * Throws OrderNotFoundError for an unknown order.
   */
  async applyPaymentResult(
    eventId: string,
    orderId: string,
    outcome: PaymentOutcome,
  ): Promise<PaymentResultOutcome> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await claimEvent(tx, eventId, PAYMENT_RESULTS_CONSUMER))) {
        return { result: 'duplicate' };
      }
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: outcome },
      });
      if (count === 1) return { result: 'applied' };

      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
      // Unknown order: throw so the claim rolls back too; a DLQ replay after a fix then
      // really gets processed instead of being skipped as a duplicate.
      if (!order) throw new OrderNotFoundError(orderId);
      // Already final (late or duplicate result): keep the claim, nothing to change.
      return { result: 'ignored', current: order.status };
    });
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    return row ? toOrder(row) : null;
  }

  /** Newest first; `id` breaks ties so pages are stable when timestamps collide. */
  async list(page: PageRequest): Promise<readonly Order[]> {
    const rows = await this.prisma.order.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.offset,
      take: page.limit,
      include: { items: true },
    });
    return rows.map(toOrder);
  }
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customerId,
    totalCents: row.totalCents,
    currency: row.currency,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  };
}
