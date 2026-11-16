import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { FakeRedis } from '../src/redis/fake-redis';
import { createGateway, tokenFor } from './test-app';

const ORDER_ID = '0b8f6c1e-4a2d-4c3b-9f1e-2d7a5b6c8e90';
const OTHER_ORDER_ID = '1c9a7d2f-5b3e-4d4c-8a2f-3e8b6c7d9fa1';

interface Seen {
  method?: string;
  url?: string;
  headers?: IncomingHttpHeaders;
  body?: string;
}

/** A real HTTP server standing in for order-service; each test sets its behaviour. */
function startFakeOrderService(seen: Seen, behaviour: { stall: boolean }): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      Object.assign(seen, { method: req.method, url: req.url, headers: req.headers, body });
      if (behaviour.stall) return; // never answers: the gateway's deadline must fire
      if (req.url === `/orders/${ORDER_ID}`) {
        res.writeHead(404, { 'content-type': 'application/problem+json' });
        res.end('{"status":404,"code":"ORDER_NOT_FOUND"}');
        return;
      }
      res.writeHead(req.method === 'POST' ? 201 : 200, { 'content-type': 'application/json' });
      res.end('{"id":"o-1","status":"PENDING"}');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

describe('api-gateway /orders proxy (e2e)', () => {
  const seen: Seen = {};
  const behaviour = { stall: false };
  let orderService: Server;
  let app: INestApplication<App>;

  beforeAll(async () => {
    orderService = await startFakeOrderService(seen, behaviour);
    const { port } = orderService.address() as AddressInfo;
    app = await createGateway(
      { ORDER_SERVICE_URL: `http://127.0.0.1:${port}` },
      { redis: new FakeRedis() }, // POST /orders needs the idempotency store
    );
  });

  /** Requests as an authenticated client (the JWT guard is covered in auth.e2e-spec.ts). */
  const api = (target: INestApplication<App> = app) =>
    request.agent(target.getHttpServer()).set('authorization', `Bearer ${tokenFor(target)}`);

  afterEach(() => {
    behaviour.stall = false;
  });

  afterAll(async () => {
    await app.close();
    orderService.closeAllConnections();
    await new Promise((resolve) => orderService.close(resolve));
  });

  it('forwards POST /orders with body and correlation ID, and returns the downstream answer', async () => {
    const res = await api()
      .post('/orders')
      .set('idempotency-key', 'proxy-test-1')
      .set('x-correlation-id', 'trace-123')
      .set('cookie', 'session=secret')
      .send({ currency: 'EUR' })
      .expect(201)
      .expect('x-correlation-id', 'trace-123');

    expect(res.body).toEqual({ id: 'o-1', status: 'PENDING' });
    expect(seen).toMatchObject({ method: 'POST', url: '/orders' });
    expect(JSON.parse(seen.body ?? '')).toEqual({ currency: 'EUR', customerId: 'c-42' });
    expect(seen.headers?.['x-correlation-id']).toBe('trace-123');
    // order-service enforces the key too (exactly-once even after a gateway timeout).
    expect(seen.headers?.['idempotency-key']).toBe('proxy-test-1');
    expect(seen.headers?.['x-customer-id']).toBe('c-42');
    expect(seen.headers?.cookie).toBeUndefined();
    // Auth terminates at the gateway; the token is not passed on.
    expect(seen.headers?.authorization).toBeUndefined();
  });

  it("creates the order for the token's subject, ignoring a spoofed customerId", async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('authorization', `Bearer ${tokenFor(app, 'attacker')}`)
      .set('idempotency-key', 'spoof-1')
      .send({ customerId: 'victim', currency: 'EUR' })
      .expect(201);

    expect(JSON.parse(seen.body ?? '')).toMatchObject({ customerId: 'attacker' });
  });

  it("sends the token's subject as x-customer-id on reads, ignoring a spoofed header", async () => {
    await request(app.getHttpServer())
      .get('/orders')
      .set('authorization', `Bearer ${tokenFor(app, 'attacker')}`)
      .set('x-customer-id', 'victim')
      .expect(200);
    expect(seen.headers?.['x-customer-id']).toBe('attacker');

    await request(app.getHttpServer())
      .get(`/orders/${OTHER_ORDER_ID}`)
      .set('authorization', `Bearer ${tokenFor(app, 'attacker')}`)
      .set('x-customer-id', 'victim')
      .expect(200);
    expect(seen.headers?.['x-customer-id']).toBe('attacker');
  });

  it('generates a correlation ID when the client sends none and forwards it', async () => {
    const res = await api().get('/orders?limit=5').expect(200);
    const id = res.headers['x-correlation-id'];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen.url).toBe('/orders?limit=5');
    expect(seen.headers?.['x-correlation-id']).toBe(id);
  });

  it('passes a downstream problem+json 404 through unchanged', async () => {
    const res = await api()
      .get(`/orders/${ORDER_ID}`)
      .expect(404)
      .expect('content-type', /application\/problem\+json/);
    expect(res.body).toEqual({ status: 404, code: 'ORDER_NOT_FOUND' });
  });

  it('rejects a non-UUID id at the edge without calling order-service', async () => {
    seen.url = undefined;
    const res = await api().get('/orders/..').expect(400);
    expect(res.body).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    expect(seen.url).toBeUndefined();
  });

  it('answers 504 problem+json when order-service does not respond in time', async () => {
    behaviour.stall = true;
    const res = await api()
      .get('/orders')
      .set('x-correlation-id', 'slow-1')
      .expect(504)
      .expect('x-correlation-id', 'slow-1');
    expect(res.body).toMatchObject({ code: 'GATEWAY_TIMEOUT', correlationId: 'slow-1' });
    expect(res.body).not.toHaveProperty('detail'); // no internal URLs leak to clients
  });

  it('answers 502 problem+json when order-service is unreachable', async () => {
    const down = await createGateway({ ORDER_SERVICE_URL: 'http://127.0.0.1:1' }); // nothing listens on port 1
    try {
      const res = await api(down).get('/orders').expect(502);
      expect(res.body).toMatchObject({ code: 'BAD_GATEWAY', status: 502 });
    } finally {
      await down.close();
    }
  });
});
