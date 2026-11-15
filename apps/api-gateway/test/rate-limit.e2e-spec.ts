import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { createGateway, tokenFor } from './test-app';

const LIMIT = 3;

describe('api-gateway rate limiting (e2e)', () => {
  let orderService: Server;
  let app: INestApplication<App>;

  // In-memory storage: these tests cover the guard wiring (keys, 429, headers).
  // The Redis script itself is unit-tested and was verified live against Redis.
  beforeEach(async () => {
    orderService = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"items":[]}');
    });
    await new Promise<void>((resolve) => orderService.listen(0, '127.0.0.1', resolve));
    const { port } = orderService.address() as AddressInfo;
    app = await createGateway(
      { ORDER_SERVICE_URL: `http://127.0.0.1:${port}`, RATE_LIMIT_MAX: LIMIT },
      { storage: new ThrottlerStorageService() },
    );
  });

  afterEach(async () => {
    await app.close();
    await new Promise((resolve) => orderService.close(resolve));
  });

  const getOrdersAs = (sub: string) =>
    request(app.getHttpServer())
      .get('/orders')
      .set('authorization', `Bearer ${tokenFor(app, sub)}`);

  it('answers the N+1th request in the window with 429 problem+json and Retry-After', async () => {
    for (let i = 1; i <= LIMIT; i++) {
      await getOrdersAs('c-1')
        .expect(200)
        .expect('x-ratelimit-remaining', String(LIMIT - i));
    }
    const res = await getOrdersAs('c-1')
      .expect(429)
      .expect('content-type', /application\/problem\+json/);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.body).toMatchObject({ status: 429, code: 'TOO_MANY_REQUESTS' });
  });

  it('gives each authenticated user its own budget', async () => {
    for (let i = 0; i < LIMIT; i++) await getOrdersAs('c-1').expect(200);
    await getOrdersAs('c-1').expect(429);
    await getOrdersAs('c-2').expect(200);
  });

  it('limits anonymous callers (public routes) by IP', async () => {
    const issueToken = () => request(app.getHttpServer()).post('/auth/token').send({ sub: 'c-9' });
    for (let i = 0; i < LIMIT; i++) await issueToken().expect(200);
    await issueToken().expect(429);
  });

  it('never throttles health probes', async () => {
    for (let i = 0; i < LIMIT + 2; i++) {
      await request(app.getHttpServer()).get('/health').expect(200);
    }
  });
});
