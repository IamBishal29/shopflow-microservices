import { z } from 'zod';
import { envelopeSchema, fields } from '../event-envelope';
import { TOPICS } from '../topics';

/** Fact: the (simulated) charge for an order went through. Key: orderId. */
export const paymentSucceededV1Schema = envelopeSchema(
  TOPICS.paymentSucceeded,
  z.object({
    orderId: fields.orderId,
    paymentId: z.uuid(),
    amountCents: fields.cents,
    currency: fields.currency,
  }),
);

/** Fact: the (simulated) charge for an order was declined. Key: orderId. */
export const paymentFailedV1Schema = envelopeSchema(
  TOPICS.paymentFailed,
  z.object({
    orderId: fields.orderId,
    reason: z.string().min(1).max(200),
    amountCents: fields.cents,
    currency: fields.currency,
  }),
);

export type PaymentSucceededV1 = z.infer<typeof paymentSucceededV1Schema>;
export type PaymentFailedV1 = z.infer<typeof paymentFailedV1Schema>;
