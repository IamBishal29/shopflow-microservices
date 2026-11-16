import type { PaymentFailedV1, PaymentSucceededV1 } from '@shopflow/contracts';

export type PaymentResultEvent = PaymentSucceededV1 | PaymentFailedV1;

/** Delivery channels; must match the CHECK constraint on notifications.channel. */
export const CHANNELS = ['log'] as const;
export type Channel = (typeof CHANNELS)[number];

/** What we tell the customer about one payment result. */
export interface Notification {
  /** The payment event's id: the dedupe key (UNIQUE in the notifications table). */
  readonly eventId: string;
  readonly orderId: string;
  readonly eventType: PaymentResultEvent['type'];
  readonly message: string;
  readonly correlationId: string;
}

/** Pure: same event in, same notification out (so a redelivery produces the same row). */
export function notificationFor(event: PaymentResultEvent): Notification {
  const { orderId, amountCents, currency } = event.payload;
  const amount = formatAmount(amountCents, currency);
  const message =
    event.type === 'payment.succeeded.v1'
      ? `Payment of ${amount} received for order ${orderId}. Thank you!`
      : `Payment of ${amount} for order ${orderId} was declined (${event.payload.reason}).`;
  return {
    eventId: event.eventId,
    orderId,
    eventType: event.type,
    message,
    correlationId: event.correlationId,
  };
}

/** 2500, "EUR" -> "25.00 EUR". Integer arithmetic: no floating-point cents. */
export function formatAmount(cents: number, currency: string): string {
  const major = Math.trunc(cents / 100);
  const minor = String(cents % 100).padStart(2, '0');
  return `${major}.${minor} ${currency}`;
}
