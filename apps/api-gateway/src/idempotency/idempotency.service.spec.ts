import { BadRequestException, GatewayTimeoutException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation';
import type { DownstreamResponse } from '../proxy/downstream.client';
import { FakeRedis } from '../redis/fake-redis';
import { requestFingerprint } from './fingerprint';
import {
  IdempotencyKeyInUseError,
  IdempotencyKeyReusedError,
  IdempotencyUnavailableError,
} from './idempotency.errors';
import { IdempotencyService } from './idempotency.service';

const config = {
  get: (key: string) => ({ DOWNSTREAM_TIMEOUT_MS: 3_000, IDEMPOTENCY_TTL_SECONDS: 86_400 })[key],
} as unknown as ConfigService<EnvironmentVariables, true>;

const created = (id: string): DownstreamResponse => ({
  status: 201,
  contentType: 'application/json',
  body: Buffer.from(JSON.stringify({ id })),
});

describe('IdempotencyService', () => {
  const fpA = requestFingerprint('POST', '/orders', { sku: 'a', qty: 1 });
  const fpB = requestFingerprint('POST', '/orders', { sku: 'a', qty: 2 });
  let redis: FakeRedis;
  let service: IdempotencyService;
  let action: jest.Mock<Promise<DownstreamResponse>, []>;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new IdempotencyService(redis as unknown as Redis, config);
    action = jest.fn<Promise<DownstreamResponse>, []>().mockResolvedValue(created('o-1'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('rejects a missing or malformed key with 400 before doing anything', async () => {
    await expect(service.execute('c-1', undefined, fpA, action)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.execute('c-1', 'has spaces', fpA, action)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(action).not.toHaveBeenCalled();
  });

  it('runs the first request and replays the stored response for a retry', async () => {
    const first = await service.execute('c-1', 'k-1', fpA, action);
    const retry = await service.execute('c-1', 'k-1', fpA, action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(first.replayed).toBe(false);
    expect(retry).toMatchObject({ replayed: true, response: { status: 201 } });
    expect(retry.response.body.toString()).toBe('{"id":"o-1"}');
  });

  it('locks for the downstream timeout + margin, then keeps the answer for the TTL', async () => {
    let lockTtl: number | undefined;
    action.mockImplementation(() => {
      lockTtl = redis.lastTtlMs.get('idempotency:{c-1}:k-1');
      return Promise.resolve(created('o-1'));
    });
    await service.execute('c-1', 'k-1', fpA, action);
    expect(lockTtl).toBe(8_000);
    expect(redis.lastTtlMs.get('idempotency:{c-1}:k-1')).toBe(86_400_000);
  });

  it('answers 409 while the first request with the key is still running', async () => {
    let finish: (r: DownstreamResponse) => void = () => undefined;
    action.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const first = service.execute('c-1', 'k-1', fpA, action);

    await expect(service.execute('c-1', 'k-1', fpA, action)).rejects.toBeInstanceOf(
      IdempotencyKeyInUseError,
    );
    finish(created('o-1'));
    await expect(first).resolves.toMatchObject({ replayed: false });
  });

  it('answers 422 when the key is reused with a different body', async () => {
    await service.execute('c-1', 'k-1', fpA, action);
    await expect(service.execute('c-1', 'k-1', fpB, action)).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError,
    );
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('stores a 4xx answer too: the same request would fail the same way', async () => {
    action.mockResolvedValue({ status: 400, contentType: null, body: Buffer.from('bad') });
    await service.execute('c-1', 'k-1', fpA, action);
    await expect(service.execute('c-1', 'k-1', fpA, action)).resolves.toMatchObject({
      replayed: true,
      response: { status: 400 },
    });
  });

  it('frees the key after a 5xx answer so the client may retry', async () => {
    action.mockResolvedValueOnce({ status: 503, contentType: null, body: Buffer.alloc(0) });
    await service.execute('c-1', 'k-1', fpA, action);
    await expect(service.execute('c-1', 'k-1', fpA, action)).resolves.toMatchObject({
      replayed: false,
      response: { status: 201 },
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('frees the key and rethrows when the downstream call fails (502/504)', async () => {
    action.mockRejectedValueOnce(new GatewayTimeoutException());
    await expect(service.execute('c-1', 'k-1', fpA, action)).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
    await expect(service.execute('c-1', 'k-1', fpA, action)).resolves.toMatchObject({
      replayed: false,
    });
  });

  it('scopes keys per user: the same key from another user is a new request', async () => {
    await service.execute('c-1', 'k-1', fpA, action);
    await expect(service.execute('c-2', 'k-1', fpA, action)).resolves.toMatchObject({
      replayed: false,
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('fails closed (503) without calling downstream when Redis is unreachable', async () => {
    redis.down = true;
    await expect(service.execute('c-1', 'k-1', fpA, action)).rejects.toBeInstanceOf(
      IdempotencyUnavailableError,
    );
    expect(action).not.toHaveBeenCalled();
  });
});

describe('requestFingerprint', () => {
  it('ignores JSON key order but not values', () => {
    const a = requestFingerprint('POST', '/orders', { a: 1, b: { c: 2, d: [1, 2] } });
    expect(requestFingerprint('POST', '/orders', { b: { d: [1, 2], c: 2 }, a: 1 })).toBe(a);
    expect(requestFingerprint('POST', '/orders', { a: 1, b: { c: 2, d: [2, 1] } })).not.toBe(a);
  });
});
