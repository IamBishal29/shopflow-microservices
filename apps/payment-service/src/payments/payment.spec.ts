import { parseEvent } from '@shopflow/contracts';
import { failedPayment, succeededPayment } from './fixtures';
import { decideCharge } from './payment';
import { paymentResultEvent } from './payment-events';

describe('decideCharge', () => {
  it('approves an amount up to and including the limit', () => {
    expect(decideCharge(1000, 1000)).toEqual({ status: 'SUCCEEDED' });
    expect(decideCharge(0, 1000)).toEqual({ status: 'SUCCEEDED' });
  });

  it('declines an amount above the limit with a reason', () => {
    expect(decideCharge(1001, 1000)).toEqual({ status: 'FAILED', reason: 'amount_over_limit' });
  });
});

describe('paymentResultEvent', () => {
  it('builds a payment.succeeded.v1 that passes the contract', () => {
    const event = paymentResultEvent(succeededPayment, 'req-7f3a');
    expect(parseEvent('payment.succeeded.v1', JSON.stringify(event))).toEqual(event);
    expect(event.payload).toMatchObject({ paymentId: succeededPayment.id, amountCents: 2500 });
  });

  it('builds a payment.failed.v1 with the reason that passes the contract', () => {
    const event = paymentResultEvent(failedPayment, 'req-7f3a');
    expect(parseEvent('payment.failed.v1', JSON.stringify(event))).toEqual(event);
    expect(event.payload).toMatchObject({ reason: 'amount_over_limit' });
  });

  it('carries the correlation ID of the order that caused it', () => {
    expect(paymentResultEvent(succeededPayment, 'req-7f3a').correlationId).toBe('req-7f3a');
  });
});
