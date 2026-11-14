import { randomUUID } from 'node:crypto';
import { OrderCreatedV1, TOPICS } from '@shopflow/contracts';
import { Order } from './order';

/** The order.created.v1 fact for a freshly saved order. Pure apart from the new eventId. */
export function orderCreatedEvent(order: Order, correlationId: string): OrderCreatedV1 {
  return {
    eventId: randomUUID(),
    type: TOPICS.orderCreated,
    occurredAt: order.createdAt.toISOString(),
    correlationId,
    payload: {
      orderId: order.id,
      customerId: order.customerId,
      totalCents: order.totalCents,
      currency: order.currency,
      items: order.items.map(({ sku, quantity, unitPriceCents }) => ({
        sku,
        quantity,
        unitPriceCents,
      })),
    },
  };
}
