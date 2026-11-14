/** Event payload fixtures for payment-service tests. */
import type { OrderCreatedV1 } from '@shopflow/contracts';
import type { Payment } from './payment';

export const orderId = '0b7f5f0e-6a3c-4c7e-9b1a-2f4d8e6c1a01';

export function orderCreated(totalCents = 2500): OrderCreatedV1 {
  return {
    eventId: '5d0c2f8a-1b3e-4f6a-8c9d-0e1f2a3b4c01',
    type: 'order.created.v1',
    occurredAt: '2026-11-14T10:00:00.000Z',
    correlationId: 'req-7f3a',
    payload: {
      orderId,
      customerId: 'customer-42',
      totalCents,
      currency: 'EUR',
      items: [{ sku: 'BOOK-1', quantity: 1, unitPriceCents: totalCents }],
    },
  };
}

export const succeededPayment: Payment = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01',
  orderId,
  amountCents: 2500,
  currency: 'EUR',
  status: 'SUCCEEDED',
  createdAt: new Date('2026-11-14T10:00:01.000Z'),
};

export const failedPayment: Payment = {
  ...succeededPayment,
  status: 'FAILED',
  reason: 'amount_over_limit',
};
