/** Valid example events, exactly as they travel on Kafka. Tests copy and break them. */
import type { OrderCreatedV1 } from './events/order-created.v1';
import type { PaymentFailedV1, PaymentSucceededV1 } from './events/payment-result.v1';

const orderId = '0b7f5f0e-6a3c-4c7e-9b1a-2f4d8e6c1a01';

export const orderCreatedV1Fixture: OrderCreatedV1 = {
  eventId: '5d0c2f8a-1b3e-4f6a-8c9d-0e1f2a3b4c01',
  type: 'order.created.v1',
  occurredAt: '2026-11-14T10:00:00.000Z',
  correlationId: 'req-7f3a',
  payload: {
    orderId,
    customerId: 'customer-42',
    totalCents: 2500,
    currency: 'EUR',
    items: [
      { sku: 'BOOK-1', quantity: 2, unitPriceCents: 1000 },
      { sku: 'PEN-1', quantity: 1, unitPriceCents: 500 },
    ],
  },
};

export const paymentSucceededV1Fixture: PaymentSucceededV1 = {
  eventId: '5d0c2f8a-1b3e-4f6a-8c9d-0e1f2a3b4c02',
  type: 'payment.succeeded.v1',
  occurredAt: '2026-11-14T10:00:01.000Z',
  correlationId: 'req-7f3a',
  payload: {
    orderId,
    paymentId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01',
    amountCents: 2500,
    currency: 'EUR',
  },
};

export const paymentFailedV1Fixture: PaymentFailedV1 = {
  eventId: '5d0c2f8a-1b3e-4f6a-8c9d-0e1f2a3b4c03',
  type: 'payment.failed.v1',
  occurredAt: '2026-11-14T10:00:01.000Z',
  correlationId: 'req-7f3a',
  payload: { orderId, reason: 'card_declined', amountCents: 2500, currency: 'EUR' },
};
