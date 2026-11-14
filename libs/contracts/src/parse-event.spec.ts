import type { EventEnvelope } from './event-envelope';
import {
  orderCreatedV1Fixture,
  paymentFailedV1Fixture,
  paymentSucceededV1Fixture,
} from './fixtures';
import { ContractViolationError, EventOf, parseEvent } from './parse-event';
import { TOPICS, dlqTopic } from './topics';

const wire = (event: unknown) => JSON.stringify(event);

function violationOf(fn: () => unknown): ContractViolationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ContractViolationError) return error;
    throw error;
  }
  throw new Error('expected a ContractViolationError');
}

// Compile-time check: every inferred event still fits the shared envelope.
type FitsEnvelope<T extends EventEnvelope<string, unknown>> = T;
export type EnvelopeCheck = [
  FitsEnvelope<EventOf<'order.created.v1'>>,
  FitsEnvelope<EventOf<'payment.succeeded.v1'>>,
  FitsEnvelope<EventOf<'payment.failed.v1'>>,
];

describe('parseEvent', () => {
  it.each([
    [TOPICS.orderCreated, orderCreatedV1Fixture],
    [TOPICS.paymentSucceeded, paymentSucceededV1Fixture],
    [TOPICS.paymentFailed, paymentFailedV1Fixture],
  ] as const)('accepts a valid %s message', (topic, fixture) => {
    expect(parseEvent(topic, wire(fixture))).toEqual(fixture);
  });

  it('ignores unknown fields so a producer can add optional data to v1', () => {
    const newer = {
      ...orderCreatedV1Fixture,
      source: 'mobile-app',
      payload: { ...orderCreatedV1Fixture.payload, couponCode: 'X1' },
    };
    const event = parseEvent(TOPICS.orderCreated, wire(newer));
    expect(event).toEqual(orderCreatedV1Fixture);
  });

  it('rejects an event sent to the wrong topic', () => {
    const error = violationOf(() => parseEvent(TOPICS.orderCreated, wire(paymentFailedV1Fixture)));
    expect(error.issues).toContainEqual(expect.stringMatching(/^type:/));
  });

  it('reports every broken field by path', () => {
    const broken = {
      ...orderCreatedV1Fixture,
      eventId: 'not-a-uuid',
      payload: {
        ...orderCreatedV1Fixture.payload,
        currency: 'euro',
        items: [{ sku: 'BOOK-1', quantity: 0, unitPriceCents: 1.5 }],
      },
    };
    const error = violationOf(() => parseEvent(TOPICS.orderCreated, wire(broken)));
    expect(error.issues.map((issue) => issue.split(':')[0])).toEqual(
      expect.arrayContaining([
        'eventId',
        'payload.currency',
        'payload.items.0.quantity',
        'payload.items.0.unitPriceCents',
      ]),
    );
    expect(error.topic).toBe('order.created.v1');
  });

  it('rejects a missing required field', () => {
    const { payload, ...rest } = paymentFailedV1Fixture;
    const withoutReason = { ...rest, payload: { ...payload, reason: undefined } };
    const error = violationOf(() => parseEvent(TOPICS.paymentFailed, wire(withoutReason)));
    expect(error.issues).toContainEqual(expect.stringMatching(/^payload\.reason:/));
  });

  it('rejects a value that is not JSON or is empty (poison messages)', () => {
    expect(violationOf(() => parseEvent(TOPICS.orderCreated, '{oops')).issues).toEqual([
      'value is not valid JSON',
    ]);
    expect(violationOf(() => parseEvent(TOPICS.orderCreated, null)).issues).toEqual([
      'message has no value',
    ]);
  });

  it('never echoes field values in the error (events may carry personal data)', () => {
    const leaky = {
      ...orderCreatedV1Fixture,
      payload: { ...orderCreatedV1Fixture.payload, customerId: 12345678 },
    };
    const error = violationOf(() => parseEvent(TOPICS.orderCreated, wire(leaky)));
    expect(error.message).toContain('payload.customerId');
    expect(error.message).not.toContain('12345678');
  });
});

describe('topics', () => {
  it('derives the dead-letter topic from the source topic', () => {
    expect(dlqTopic(TOPICS.paymentFailed)).toBe('payment.failed.v1.dlq');
  });
});
