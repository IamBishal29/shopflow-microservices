import { settleWithin } from './shutdown';

describe('settleWithin', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reports done as soon as the work finishes, without waiting for the timeout', async () => {
    await expect(settleWithin(Promise.resolve('ok'), 3_000)).resolves.toEqual({ status: 'done' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports a failure instead of throwing, so later shutdown steps still run', async () => {
    const error = new Error('broker gone');
    await expect(settleWithin(Promise.reject(error), 3_000)).resolves.toEqual({
      status: 'failed',
      error,
    });
  });

  it('gives up on work that never finishes once the timeout passes', async () => {
    const outcome = settleWithin(new Promise(() => undefined), 3_000);
    await jest.advanceTimersByTimeAsync(3_000);
    await expect(outcome).resolves.toEqual({ status: 'timed-out' });
  });
});
