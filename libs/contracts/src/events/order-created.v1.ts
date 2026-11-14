import { z } from 'zod';
import { envelopeSchema, fields } from '../event-envelope';
import { TOPICS } from '../topics';

/** Fact: an order was placed and is waiting for payment. Key: orderId. */
export const orderCreatedV1Schema = envelopeSchema(
  TOPICS.orderCreated,
  z.object({
    orderId: fields.orderId,
    customerId: z.string().min(1),
    totalCents: fields.cents,
    currency: fields.currency,
    items: z
      .array(
        z.object({
          sku: z.string().min(1),
          quantity: z.int().positive(),
          unitPriceCents: fields.cents,
        }),
      )
      .min(1),
  }),
);

export type OrderCreatedV1 = z.infer<typeof orderCreatedV1Schema>;
