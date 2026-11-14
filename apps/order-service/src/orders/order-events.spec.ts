import { parseEvent } from '@shopflow/contracts';
import { Order } from './order';
import { orderCreatedEvent } from './order-events';

const order: Order = {
  id: '6f1c2b8e-0c5e-4f8a-9d2e-1a2b3c4d5e6f',
  customerId: 'customer-1',
  currency: 'EUR',
  totalCents: 2500,
  status: 'PENDING',
  items: [{ sku: 'SKU-1', quantity: 2, unitPriceCents: 1250 }],
  createdAt: new Date('2026-11-14T10:00:00.000Z'),
  updatedAt: new Date('2026-11-14T10:00:00.000Z'),
};

describe('orderCreatedEvent', () => {
  it('produces a message that passes the order.created.v1 contract', () => {
    const event = orderCreatedEvent(order, 'corr-1');
    expect(parseEvent('order.created.v1', JSON.stringify(event))).toEqual(event);
  });

  it('copies the order facts and keeps internal fields (status, updatedAt) out', () => {
    const event = orderCreatedEvent(order, 'corr-1');
    expect(event).toMatchObject({
      occurredAt: '2026-11-14T10:00:00.000Z',
      correlationId: 'corr-1',
      payload: { orderId: order.id, customerId: 'customer-1', totalCents: 2500, currency: 'EUR' },
    });
    expect(event.payload).not.toHaveProperty('status');
  });

  it('gives every event a new id (the consumer deduplication key)', () => {
    expect(orderCreatedEvent(order, 'c').eventId).not.toBe(orderCreatedEvent(order, 'c').eventId);
  });
});
