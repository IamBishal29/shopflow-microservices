import { Injectable } from '@nestjs/common';
import type { EventEnvelope, Topic } from '@shopflow/contracts';
import { claimEvent } from '@shopflow/database';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NewOrder, Order, OrderStatus, PageRequest, PaymentOutcome } from './order';
import { OrderNotFoundError } from './order.errors';

type OrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>;
type OutboxEvent = EventEnvelope<Topic, unknown>;

/** Name under which the payment-results handler records processed events. */
export const PAYMENT_RESULTS_CONSUMER = 'order-service.payment-results';

export interface CreatedOrder {
  readonly order: Order;
  /** true when an order with this idempotency key already existed and was returned. */
  readonly replayed: boolean;
}

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
   *
   * With an idempotency key, at most one order exists per (customer, key): a repeat gets
   * the existing order back. The lookup is the fast path; the UNIQUE index is the
   * guarantee when two requests race (the loser's transaction, incl. its outbox row, rolls
   * back and it returns the winner's order).
   */
  async create(
    order: NewOrder,
    toEvent: (created: Order) => OutboxEvent,
    idempotencyKey?: string,
  ): Promise<CreatedOrder> {
    if (idempotencyKey) {
      const existing = await this.findByKey(order.customerId, idempotencyKey);
      if (existing) return { order: existing, replayed: true };
    }
    try {
      const created = await this.insert(order, toEvent, idempotencyKey);
      return { order: created, replayed: false };
    } catch (error: unknown) {
      if (idempotencyKey && isUniqueViolation(error)) {
        const winner = await this.findByKey(order.customerId, idempotencyKey);
        if (winner) return { order: winner, replayed: true };
      }
      throw error;
    }
  }

  private async findByKey(customerId: string, idempotencyKey: string): Promise<Order | null> {
    const row = await this.prisma.order.findFirst({
      where: { customerId, idempotencyKey },
      include: { items: true },
    });
    return row ? toOrder(row) : null;
  }

  private insert(
    order: NewOrder,
    toEvent: (created: Order) => OutboxEvent,
    idempotencyKey: string | undefined,
  ): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.order.create({
        data: {
          customerId: order.customerId,
          currency: order.currency,
          totalCents: order.totalCents,
          idempotencyKey: idempotencyKey ?? null,
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

  /** Ownership is part of the WHERE: there is no code path that reads first, checks later. */
  async findById(id: string, customerId: string): Promise<Order | null> {
    const row = await this.prisma.order.findFirst({
      where: { id, customerId },
      include: { items: true },
    });
    return row ? toOrder(row) : null;
  }

  /**
   * One customer's orders, newest first; `id` breaks ties so pages are stable. Served by
   * the (customer_id, created_at DESC, id DESC) index: a range read, no sort.
   */
  async list(customerId: string, page: PageRequest): Promise<readonly Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.offset,
      take: page.limit,
      include: { items: true },
    });
    return rows.map(toOrder);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
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
