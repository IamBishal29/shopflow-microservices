import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { FakeRedis } from '../src/idempotency/fake-redis';
import { createGateway, tokenFor } from './test-app';

const ORDER = { customerId: 'c-1', currency: 'EUR', items: [{ sku: 'p-1', quantity: 1 }] };

describe('api-gateway idempotency keys on POST /orders (e2e)', () => {
  const downstream = { creates: 0, stall: false };
  let orderService: Server;
  let redis: FakeRedis;
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Fake order-service: every POST creates a new order with a new id.
    orderService = createServer((req, res) => {
      req.resume().on('end', () => {
        if (downstream.stall) return;
        downstream.creates += 1;
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: `o-${downstream.creates}`, status: 'PENDING' }));
      });
    });
    await new Promise<void>((resolve) => orderService.listen(0, '127.0.0.1', resolve));
    const { port } = orderService.address() as AddressInfo;
    redis = new FakeRedis();
    app = await createGateway(
      { ORDER_SERVICE_URL: `http://127.0.0.1:${port}`, DOWNSTREAM_TIMEOUT_MS: 300 },
      { redis },
    );
  });

  beforeEach(() => {
    Object.assign(downstream, { creates: 0, stall: false });
    redis.down = false;
  });

  afterAll(async () => {
    await app.close();
    orderService.closeAllConnections();
    await new Promise((resolve) => orderService.close(resolve));
  });

  const createOrder = (key: string | undefined, body: object = ORDER, sub = 'c-1') => {
    const req = request(app.getHttpServer())
      .post('/orders')
      .set('authorization', `Bearer ${tokenFor(app, sub)}`);
    return (key ? req.set('idempotency-key', key) : req).send(body);
  };

  it('a retried POST returns the first order instead of creating a second one', async () => {
    const first = await createOrder('key-retry').expect(201);
    const retry = await createOrder('key-retry').expect(201).expect('idempotent-replayed', 'true');

    expect(retry.body).toEqual(first.body);
    expect(downstream.creates).toBe(1);
  });

  it('requires an Idempotency-Key header (400 problem+json)', async () => {
    const res = await createOrder(undefined).expect(400);
    expect(res.body).toMatchObject({ code: 'BAD_REQUEST' });
    expect(downstream.creates).toBe(0);
  });

  it('answers 422 when the key is reused with a different body', async () => {
    await createOrder('key-reuse').expect(201);
    const res = await createOrder('key-reuse', { ...ORDER, currency: 'USD' }).expect(422);
    expect(res.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(downstream.creates).toBe(1);
  });

  it('answers 409 to a concurrent duplicate while the first is in flight', async () => {
    downstream.stall = true;
    const first = createOrder('key-busy').then((res) => res); // starts now, times out (504)
    await new Promise((resolve) => setTimeout(resolve, 100));
    const res = await createOrder('key-busy').expect(409);
    expect(res.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_IN_USE' });
    expect((await first).status).toBe(504);
  });

  it('keeps keys per user: another user with the same key creates its own order', async () => {
    await createOrder('key-shared', ORDER, 'c-1').expect(201);
    const other = await createOrder('key-shared', ORDER, 'c-2').expect(201);
    expect(other.headers['idempotent-replayed']).toBeUndefined();
    expect(downstream.creates).toBe(2);
  });

  it('fails closed with 503 + Retry-After when Redis is down, without creating an order', async () => {
    redis.down = true;
    const res = await createOrder('key-down').expect(503).expect('retry-after', '5');
    expect(res.body).toMatchObject({ status: 503 });
    expect(downstream.creates).toBe(0);
  });
});
