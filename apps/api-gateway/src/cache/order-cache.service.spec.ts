import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation';
import type { DownstreamResponse } from '../proxy/downstream.client';
import { FakeRedis } from '../redis/fake-redis';
import { OrderCacheService } from './order-cache.service';

const ORDER_ID = '0b8f6c1e-4a2d-4c3b-9f1e-2d7a5b6c8e90';

const config = {
  get: (key: string) => ({ ORDER_CACHE_TTL_SECONDS: 5 })[key],
} as unknown as ConfigService<EnvironmentVariables, true>;

const answer = (status: number, body: object): DownstreamResponse => ({
  status,
  contentType: 'application/json',
  body: Buffer.from(JSON.stringify(body)),
});

describe('OrderCacheService', () => {
  let redis: FakeRedis;
  let cache: OrderCacheService;
  let load: jest.Mock<Promise<DownstreamResponse>, []>;

  beforeEach(() => {
    redis = new FakeRedis();
    cache = new OrderCacheService(redis as unknown as Redis, config);
    load = jest
      .fn<Promise<DownstreamResponse>, []>()
      .mockResolvedValue(answer(200, { id: ORDER_ID, status: 'PENDING' }));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('calls order-service on a miss and serves the stored answer on the next read', async () => {
    const miss = await cache.getOrLoad('c-1', ORDER_ID, load);
    const hit = await cache.getOrLoad('c-1', ORDER_ID, load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(miss.hit).toBe(false);
    expect(hit).toMatchObject({ hit: true, response: { status: 200 } });
    expect(hit.response.contentType).toBe('application/json');
    expect(hit.response.body.toString()).toBe(miss.response.body.toString());
  });

  it('stores entries with the configured TTL, keyed by user and order', async () => {
    await cache.getOrLoad('c-1', ORDER_ID, load);
    expect(redis.lastTtlMs.get(`order-cache:{c-1}:${ORDER_ID}`)).toBe(5_000);
  });

  it("never serves one user's cached order to another user", async () => {
    await cache.getOrLoad('c-1', ORDER_ID, load);
    const other = await cache.getOrLoad('c-2', ORDER_ID, load);

    expect(other.hit).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each([404, 500, 503])('does not cache a %i answer', async (status) => {
    load.mockResolvedValue(answer(status, { status }));
    await cache.getOrLoad('c-1', ORDER_ID, load);
    const again = await cache.getOrLoad('c-1', ORDER_ID, load);

    expect(again.hit).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('fails open: with Redis down every read goes to order-service', async () => {
    redis.down = true;
    const first = await cache.getOrLoad('c-1', ORDER_ID, load);
    const second = await cache.getOrLoad('c-1', ORDER_ID, load);

    expect([first.hit, second.hit]).toEqual([false, false]);
    expect(second.response.status).toBe(200);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('passes order-service errors (502/504) through without caching', async () => {
    load.mockRejectedValue(new Error('boom'));
    await expect(cache.getOrLoad('c-1', ORDER_ID, load)).rejects.toThrow('boom');
  });
});
