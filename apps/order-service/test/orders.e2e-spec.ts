import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { EventEnvelope, Topic } from '@shopflow/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { NewOrder, Order, PageRequest } from '../src/orders/order';
import { CreatedOrder, OrdersRepository } from '../src/orders/orders.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './test-app';

type OutboxEvent = EventEnvelope<Topic, unknown>;

/** In-memory stand-in for the Prisma repository; same contract, no database. */
class InMemoryOrdersRepository {
  private readonly orders: Order[] = [];
  /** What the real repository would write to the outbox, newest last. */
  readonly outbox: OutboxEvent[] = [];

  /** (customerId, key) -> order id, like the UNIQUE index on orders. */
  private readonly keys = new Map<string, string>();

  create(
    order: NewOrder,
    toEvent: (created: Order) => OutboxEvent,
    idempotencyKey?: string,
  ): Promise<CreatedOrder> {
    const slot = idempotencyKey && `${order.customerId}/${idempotencyKey}`;
    const existing = slot && this.orders.find((o) => o.id === this.keys.get(slot));
    if (existing) return Promise.resolve({ order: existing, replayed: true });

    const now = new Date();
    const saved: Order = {
      ...order,
      id: randomUUID(),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    this.orders.unshift(saved);
    this.outbox.push(toEvent(saved));
    if (slot) this.keys.set(slot, saved.id);
    return Promise.resolve({ order: saved, replayed: false });
  }

  findById(id: string, customerId: string): Promise<Order | null> {
    return Promise.resolve(
      this.orders.find((o) => o.id === id && o.customerId === customerId) ?? null,
    );
  }

  list(customerId: string, page: PageRequest): Promise<readonly Order[]> {
    const own = this.orders.filter((o) => o.customerId === customerId);
    return Promise.resolve(own.slice(page.offset, page.offset + page.limit));
  }
}

const validOrder = {
  customerId: 'customer-1',
  currency: 'EUR',
  items: [
    { sku: 'SKU-1', quantity: 2, unitPriceCents: 1250 },
    { sku: 'SKU-2', quantity: 1, unitPriceCents: 1200 },
  ],
};

describe('Orders API (e2e)', () => {
  const repository = new InMemoryOrdersRepository();
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(PrismaService)
        .useValue({ onModuleInit: jest.fn(), onApplicationShutdown: jest.fn() })
        .overrideProvider(OrdersRepository)
        .useValue(repository),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /orders', () => {
    it('creates a PENDING order with the total computed by the server', async () => {
      const res = await request(app.getHttpServer()).post('/orders').send(validOrder).expect(201);
      expect(res.body).toMatchObject({
        customerId: 'customer-1',
        currency: 'EUR',
        status: 'PENDING',
        totalCents: 3700,
      });
    });

    it('stamps the x-correlation-id header on the order.created outbox event', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('x-correlation-id', 'gw-trace-42')
        .send(validOrder)
        .expect(201);

      const { id } = res.body as { id: string };
      expect(repository.outbox.at(-1)).toMatchObject({
        type: 'order.created.v1',
        correlationId: 'gw-trace-42',
        payload: { orderId: id },
      });
    });

    it.each([
      ['missing', undefined],
      ['unsafe', 'bad id <script>'],
    ])('generates a UUID correlation ID when the header is %s', async (_, header) => {
      const req = request(app.getHttpServer()).post('/orders');
      await (header ? req.set('x-correlation-id', header) : req).send(validOrder).expect(201);

      expect(repository.outbox.at(-1)?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('returns the same order for a repeated Idempotency-Key, with one event only', async () => {
      const post = () =>
        request(app.getHttpServer()).post('/orders').set('idempotency-key', 'e2e-key-1');
      const events = repository.outbox.length;

      const first = await post().send(validOrder).expect(201);
      // E.g. the gateway timed out on the first call and the client retried.
      const repeat = await post()
        .send({ ...validOrder, currency: 'USD' })
        .expect(201)
        .expect('idempotent-replayed', 'true');

      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(repeat.body).toEqual(first.body);
      expect(repository.outbox.length).toBe(events + 1);
    });

    it('rejects a malformed Idempotency-Key with 400', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('idempotency-key', 'has spaces')
        .send(validOrder)
        .expect(400);
    });

    it('rejects client-supplied totalCents and status (no mass assignment)', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validOrder, totalCents: 1, status: 'PAID' })
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/property totalCents should not exist/);
    });

    it('validates nested items and answers with a VALIDATION_FAILED problem', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validOrder, items: [{ sku: 'SKU-1', quantity: 0, unitPriceCents: 100 }] })
        .expect(400)
        .expect('content-type', /application\/problem\+json/);
      expect(res.body).toMatchObject({
        type: 'urn:shopflow:problem:validation-failed',
        status: 400,
        code: 'VALIDATION_FAILED',
        instance: '/orders',
        errors: ['items.0.quantity must not be less than 1'],
      });
    });

    it('answers malformed JSON with 400, not 500', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('content-type', 'application/json')
        .send('{"customerId": ')
        .expect(400);
      expect(res.body).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    });

    it('rejects an order without items', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validOrder, items: [] })
        .expect(400);
    });

    it('rejects a lower-case currency code', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validOrder, currency: 'eur' })
        .expect(400);
    });
  });

  /** A read as the gateway sends it: the caller's JWT `sub` in x-customer-id. */
  const readAs = (path: string, customerId = 'customer-1') =>
    request(app.getHttpServer()).get(path).set('x-customer-id', customerId);

  const createFor = async (customerId: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .send({ ...validOrder, customerId })
      .expect(201);
    return (res.body as { id: string }).id;
  };

  describe('GET /orders/:id', () => {
    it('returns an existing order to its owner', async () => {
      const id = await createFor('customer-1');
      const res = await readAs(`/orders/${id}`).expect(200);
      expect(res.body).toMatchObject({ id, totalCents: 3700 });
    });

    it("answers 404 (not 403) for another customer's order, so its existence is not leaked", async () => {
      const id = await createFor('customer-1');
      const res = await readAs(`/orders/${id}`, 'customer-2').expect(404);
      expect(res.body).toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });

    it('answers 401 when the caller identity is missing, instead of reading any order', async () => {
      const id = await createFor('customer-1');
      const res = await request(app.getHttpServer()).get(`/orders/${id}`).expect(401);
      expect(res.body).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    });

    it('returns an ORDER_NOT_FOUND problem for an unknown id, echoing the correlation ID', async () => {
      const id = randomUUID();
      const res = await readAs(`/orders/${id}`)
        .set('x-correlation-id', 'e2e-123')
        .expect(404)
        .expect('content-type', /application\/problem\+json/);
      expect(res.body).toMatchObject({
        type: 'urn:shopflow:problem:order-not-found',
        title: 'Order not found',
        status: 404,
        detail: `Order ${id} not found`,
        instance: `/orders/${id}`,
        code: 'ORDER_NOT_FOUND',
        correlationId: 'e2e-123',
      });
    });

    it('answers unknown routes with an about:blank problem', async () => {
      const res = await request(app.getHttpServer()).get('/nope').expect(404);
      expect(res.body).toMatchObject({
        type: 'about:blank',
        title: 'Not Found',
        code: 'NOT_FOUND',
      });
    });

    it('returns 400 for an id that is not a UUID', async () => {
      await readAs('/orders/not-a-uuid').expect(400);
    });
  });

  describe('GET /orders', () => {
    it("lists only the caller's orders", async () => {
      const mine = await createFor('lister-1');
      await createFor('lister-2');
      const res = await readAs('/orders', 'lister-1').expect(200);
      const body = res.body as { items: { id: string }[] };
      expect(body.items.map((o) => o.id)).toEqual([mine]);
    });

    it('answers 401 without a caller identity', async () => {
      await request(app.getHttpServer()).get('/orders').expect(401);
    });

    it('defaults to limit 20, offset 0', async () => {
      const res = await readAs('/orders').expect(200);
      expect(res.body).toMatchObject({ limit: 20, offset: 0 });
    });

    it('converts query strings to numbers and pages the result', async () => {
      const res = await readAs('/orders?limit=1&offset=1').expect(200);
      const body = res.body as { items: unknown[]; limit: number; offset: number };
      expect(body.limit).toBe(1);
      expect(body.offset).toBe(1);
      expect(body.items).toHaveLength(1);
    });

    it('rejects a page size above 100', async () => {
      await readAs('/orders?limit=101').expect(400);
    });
  });
});
