import { Logger } from '@nestjs/common';
import { formatAmount, notificationFor } from './notification';
import { LogNotificationSender } from './notification-sender';
import { orderId, paymentFailed, paymentSucceeded } from './payment-event.fixtures';

describe('notificationFor', () => {
  it('thanks the customer when the payment succeeded', () => {
    expect(notificationFor(paymentSucceeded)).toEqual({
      eventId: paymentSucceeded.eventId,
      orderId,
      eventType: 'payment.succeeded.v1',
      message: `Payment of 37.05 EUR received for order ${orderId}. Thank you!`,
      correlationId: 'req-7f3a',
    });
  });

  it('explains a declined payment with its reason', () => {
    expect(notificationFor(paymentFailed).message).toBe(
      `Payment of 2500.00 USD for order ${orderId} was declined (amount_over_limit).`,
    );
  });

  it('is deterministic, so a redelivered event produces the same notification', () => {
    expect(notificationFor(paymentSucceeded)).toEqual(notificationFor(paymentSucceeded));
  });
});

describe('formatAmount', () => {
  it.each([
    [0, '0.00 EUR'],
    [5, '0.05 EUR'],
    [100, '1.00 EUR'],
    [123_456_789, '1234567.89 EUR'],
  ])('formats %d cents without floating-point rounding', (cents, expected) => {
    expect(formatAmount(cents, 'EUR')).toBe(expected);
  });
});

describe('LogNotificationSender', () => {
  it('"delivers" by logging the message with the event and correlation id', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const sender = new LogNotificationSender();
      await sender.send(notificationFor(paymentSucceeded));
      expect(sender.channel).toBe('log');
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(`[event ${paymentSucceeded.eventId}, correlation req-7f3a]`),
      );
    } finally {
      log.mockRestore();
    }
  });
});
