import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const ORDER_ID = '0b8f6c1e-4a2d-4c3b-9f1e-2d7a5b6c8e90';

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

async function createGateway(orderServiceUrl: string): Promise<INestApplication<App>> {
  // A plain stand-in: a real ConfigService would prefer process.env (set by setup-env.ts).
  const values: Readonly<Record<string, unknown>> = {
    ORDER_SERVICE_URL: orderServiceUrl,
    DOWNSTREAM_TIMEOUT_MS: 200,
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: (key: string) => values[key] })
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

describe('api-gateway /orders proxy (e2e)', () => {
  const seen: Seen = {};
  const behaviour = { stall: false };
  let orderService: Server;
  let app: INestApplication<App>;

  beforeAll(async () => {
    orderService = await startFakeOrderService(seen, behaviour);
    const { port } = orderService.address() as AddressInfo;
    app = await createGateway(`http://127.0.0.1:${port}`);
  });

  afterEach(() => {
    behaviour.stall = false;
  });

  afterAll(async () => {
    await app.close();
    orderService.closeAllConnections();
    await new Promise((resolve) => orderService.close(resolve));
  });

  it('forwards POST /orders with body and correlation ID, and returns the downstream answer', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('x-correlation-id', 'trace-123')
      .set('cookie', 'session=secret')
      .send({ customerId: 'c-1' })
      .expect(201)
      .expect('x-correlation-id', 'trace-123');

    expect(res.body).toEqual({ id: 'o-1', status: 'PENDING' });
    expect(seen).toMatchObject({ method: 'POST', url: '/orders', body: '{"customerId":"c-1"}' });
    expect(seen.headers?.['x-correlation-id']).toBe('trace-123');
    expect(seen.headers?.cookie).toBeUndefined();
  });

  it('generates a correlation ID when the client sends none and forwards it', async () => {
    const res = await request(app.getHttpServer()).get('/orders?limit=5').expect(200);
    const id = res.headers['x-correlation-id'];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen.url).toBe('/orders?limit=5');
    expect(seen.headers?.['x-correlation-id']).toBe(id);
  });

  it('passes a downstream problem+json 404 through unchanged', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${ORDER_ID}`)
      .expect(404)
      .expect('content-type', /application\/problem\+json/);
    expect(res.body).toEqual({ status: 404, code: 'ORDER_NOT_FOUND' });
  });

  it('rejects a non-UUID id at the edge without calling order-service', async () => {
    seen.url = undefined;
    const res = await request(app.getHttpServer()).get('/orders/..').expect(400);
    expect(res.body).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    expect(seen.url).toBeUndefined();
  });

  it('answers 504 problem+json when order-service does not respond in time', async () => {
    behaviour.stall = true;
    const res = await request(app.getHttpServer())
      .get('/orders')
      .set('x-correlation-id', 'slow-1')
      .expect(504)
      .expect('x-correlation-id', 'slow-1');
    expect(res.body).toMatchObject({ code: 'GATEWAY_TIMEOUT', correlationId: 'slow-1' });
    expect(res.body).not.toHaveProperty('detail'); // no internal URLs leak to clients
  });

  it('answers 502 problem+json when order-service is unreachable', async () => {
    const down = await createGateway('http://127.0.0.1:1'); // nothing listens on port 1
    try {
      const res = await request(down.getHttpServer()).get('/orders').expect(502);
      expect(res.body).toMatchObject({ code: 'BAD_GATEWAY', status: 502 });
    } finally {
      await down.close();
    }
  });
});
