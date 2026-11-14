/** payment.*.v1 event fixtures for order-service tests. */
import type { PaymentFailedV1, PaymentSucceededV1 } from '@shopflow/contracts';

export const paidOrderId = '6f1c2b8e-0c5e-4f8a-9d2e-1a2b3c4d5e6f';

export const paymentSucceeded: PaymentSucceededV1 = {
  eventId: '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e01',
  type: 'payment.succeeded.v1',
  occurredAt: '2026-11-14T10:00:01.000Z',
  correlationId: 'req-7f3a',
  payload: {
    orderId: paidOrderId,
    paymentId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01',
    amountCents: 3700,
    currency: 'EUR',
  },
};

export const paymentFailed: PaymentFailedV1 = {
  eventId: '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e02',
  type: 'payment.failed.v1',
  occurredAt: '2026-11-14T10:00:01.000Z',
  correlationId: 'req-7f3a',
  payload: {
    orderId: paidOrderId,
    reason: 'amount_over_limit',
    amountCents: 3700,
    currency: 'EUR',
  },
};
