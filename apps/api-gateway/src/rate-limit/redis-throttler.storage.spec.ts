import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  const evalMock = jest.fn<Promise<unknown>, unknown[]>();
  const storage = new RedisThrottlerStorage({ eval: evalMock } as unknown as Redis);
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

  beforeEach(() => {
    evalMock.mockReset();
    warn.mockClear();
  });
  afterAll(() => warn.mockRestore());

  it('runs one atomic script with hash-tagged keys, window, limit and block (ms)', async () => {
    evalMock.mockResolvedValue([1, 60_000, 0, 0]);
    await storage.increment('default:user:c-42', 60_000, 100, 60_000, 'default');
    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      2,
      'ratelimit:default:{default:user:c-42}:hits',
      'ratelimit:default:{default:user:c-42}:block',
      60_000,
      100,
      60_000,
    );
  });

  it('reports hits and seconds left in the window while under the limit', async () => {
    evalMock.mockResolvedValue([3, 41_200, 0, 0]);
    await expect(storage.increment('k', 60_000, 100, 60_000, 'default')).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 42, // rounded up: never tell a client to retry too early
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('reports a block with whole seconds until it lifts (Retry-After)', async () => {
    evalMock.mockResolvedValue([101, 5_000, 1, 59_001]);
    await expect(storage.increment('k', 60_000, 100, 60_000, 'default')).resolves.toMatchObject({
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });

  it('fails open when Redis is unreachable, and logs it', async () => {
    evalMock.mockRejectedValue(new Error("Stream isn't writeable"));
    await expect(storage.increment('k', 60_000, 100, 60_000, 'default')).resolves.toMatchObject({
      isBlocked: false,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rate limit not enforced'));
  });

  it('fails open on an unexpected script reply instead of crashing the request', async () => {
    evalMock.mockResolvedValue('OK');
    await expect(storage.increment('k', 60_000, 100, 60_000, 'default')).resolves.toMatchObject({
      isBlocked: false,
    });
  });
});
