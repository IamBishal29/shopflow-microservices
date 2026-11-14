import { randomUUID } from 'node:crypto';
import { PaymentFailedV1, PaymentSucceededV1, TOPICS } from '@shopflow/contracts';
import { Payment } from './payment';

/**
 * The result fact for a recorded payment. `correlationId` is copied from the incoming
 * order.created.v1, so one ID follows the order through every service's logs.
 */
export function paymentResultEvent(
  payment: Payment,
  correlationId: string,
): PaymentSucceededV1 | PaymentFailedV1 {
  const common = {
    eventId: randomUUID(),
    occurredAt: payment.createdAt.toISOString(),
    correlationId,
  };
  const money = {
    orderId: payment.orderId,
    amountCents: payment.amountCents,
    currency: payment.currency,
  };
  return payment.status === 'SUCCEEDED'
    ? { ...common, type: TOPICS.paymentSucceeded, payload: { ...money, paymentId: payment.id } }
    : { ...common, type: TOPICS.paymentFailed, payload: { ...money, reason: payment.reason } };
}
