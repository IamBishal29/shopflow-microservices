import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { FakeRedis } from '../src/redis/fake-redis';
import { createGateway, tokenFor } from './test-app';

const PAID_ORDER = '0b8f6c1e-4a2d-4c3b-9f1e-2d7a5b6c8e90';
const MISSING_ORDER = '7d3e1a2b-5c4f-4e6d-8a9b-0c1d2e3f4a5b';

describe('api-gateway order cache on GET /orders/:id (e2e)', () => {
  let reads = 0;
  let orderService: Server;
  let redis: FakeRedis;
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Fake order-service: counts reads, so tests can see whether the cache answered.
    orderService = createServer((req, res) => {
      reads += 1;
      if (req.url === `/orders/${PAID_ORDER}`) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: PAID_ORDER, status: 'PAID' }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/problem+json' });
      res.end('{"status":404,"code":"ORDER_NOT_FOUND"}');
    });
    await new Promise<void>((resolve) => orderService.listen(0, '127.0.0.1', resolve));
    const { port } = orderService.address() as AddressInfo;
    redis = new FakeRedis();
    app = await createGateway({ ORDER_SERVICE_URL: `http://127.0.0.1:${port}` }, { redis });
  });

  beforeEach(async () => {
    reads = 0;
    redis.down = false;
    await redis.del(`order-cache:{c-1}:${PAID_ORDER}`);
  });

  afterAll(async () => {
    await app.close();
    orderService.closeAllConnections();
    await new Promise((resolve) => orderService.close(resolve));
  });

  const getOrder = (id: string, sub = 'c-1') =>
    request(app.getHttpServer())
      .get(`/orders/${id}`)
      .set('authorization', `Bearer ${tokenFor(app, sub)}`);

  it('serves a repeated read from Redis without calling order-service', async () => {
    const miss = await getOrder(PAID_ORDER).expect(200).expect('x-cache', 'MISS');
    const hit = await getOrder(PAID_ORDER)
      .expect(200)
      .expect('x-cache', 'HIT')
      .expect('content-type', /application\/json/);

    expect(hit.body).toEqual(miss.body);
    expect(reads).toBe(1);
  });

  it('keeps cache entries per user', async () => {
    await getOrder(PAID_ORDER, 'c-1').expect('x-cache', 'MISS');
    await getOrder(PAID_ORDER, 'c-2').expect('x-cache', 'MISS');
    expect(reads).toBe(2);
  });

  it('does not cache a 404, so an order created a moment later becomes visible', async () => {
    await getOrder(MISSING_ORDER).expect(404).expect('x-cache', 'MISS');
    await getOrder(MISSING_ORDER).expect(404).expect('x-cache', 'MISS');
    expect(reads).toBe(2);
  });

  it('still answers from order-service when Redis is down (fail open)', async () => {
    redis.down = true;
    await getOrder(PAID_ORDER).expect(200).expect('x-cache', 'MISS');
    await getOrder(PAID_ORDER).expect(200).expect('x-cache', 'MISS');
    expect(reads).toBe(2);
  });
});
