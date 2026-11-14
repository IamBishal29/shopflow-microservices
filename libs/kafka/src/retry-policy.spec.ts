import {
  backoffDelay,
  describeError,
  numberHeader,
  RetryPolicy,
  routeFailure,
} from './retry-policy';

const policy: RetryPolicy = { maxAttempts: 4, baseDelayMs: 1_000, maxDelayMs: 5_000 };
const maxJitter = () => 0.999_999;

describe('backoffDelay', () => {
  it('doubles the ceiling per failed attempt and caps it', () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffDelay(n, policy, maxJitter))).toEqual([
      1_000, 2_000, 4_000, 5_000, 5_000,
    ]);
  });

  it('applies full jitter: anywhere between 0 and the ceiling', () => {
    expect(backoffDelay(3, policy, () => 0)).toBe(0);
    expect(backoffDelay(3, policy, () => 0.5)).toBe(2_000);
  });
});

describe('routeFailure', () => {
  it('schedules the next attempt while attempts remain', () => {
    expect(routeFailure(1, false, policy, () => 0.5)).toEqual({
      to: 'retry',
      nextAttempt: 2,
      delayMs: 500,
    });
  });

  it('sends to the DLQ once the last attempt failed', () => {
    expect(routeFailure(4, false, policy)).toEqual({ to: 'dlq', reason: 'exhausted' });
  });

  it('sends permanent errors to the DLQ without retrying', () => {
    expect(routeFailure(1, true, policy)).toEqual({ to: 'dlq', reason: 'permanent' });
  });
});

describe('describeError', () => {
  it('flattens multi-line messages and bounds their length', () => {
    const error = new RangeError(`line one\n   line two\n${'x'.repeat(600)}`);
    const { type, message } = describeError(error);
    expect(type).toBe('RangeError');
    expect(message.startsWith('line one line two x')).toBe(true);
    expect(message).toHaveLength(500);
  });
});

describe('numberHeader', () => {
  it('reads Buffer and string headers and falls back when missing or invalid', () => {
    expect(numberHeader({ a: Buffer.from('3') }, 'a', 1)).toBe(3);
    expect(numberHeader({ a: '7' }, 'a', 1)).toBe(7);
    expect(numberHeader({}, 'a', 1)).toBe(1);
    expect(numberHeader({ a: 'x' }, 'a', 1)).toBe(1);
  });
});
