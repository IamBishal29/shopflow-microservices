import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { NewOrder, Order, PageRequest } from '../src/orders/order';
import { OrdersRepository } from '../src/orders/orders.repository';
import { PrismaService } from '../src/prisma/prisma.service';

/** In-memory stand-in for the Prisma repository; same contract, no database. */
class InMemoryOrdersRepository {
  private readonly orders: Order[] = [];

  create(order: NewOrder): Promise<Order> {
    const now = new Date();
    const saved: Order = {
      ...order,
      id: randomUUID(),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    this.orders.unshift(saved);
    return Promise.resolve(saved);
  }

  findById(id: string): Promise<Order | null> {
    return Promise.resolve(this.orders.find((o) => o.id === id) ?? null);
  }

  list(page: PageRequest): Promise<readonly Order[]> {
    return Promise.resolve(this.orders.slice(page.offset, page.offset + page.limit));
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
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(OrdersRepository)
      .useValue(new InMemoryOrdersRepository())
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
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

  describe('GET /orders/:id', () => {
    it('returns an existing order', async () => {
      const created = await request(app.getHttpServer()).post('/orders').send(validOrder);
      const { id } = created.body as { id: string };
      const res = await request(app.getHttpServer()).get(`/orders/${id}`).expect(200);
      expect(res.body).toMatchObject({ id, totalCents: 3700 });
    });

    it('returns an ORDER_NOT_FOUND problem for an unknown id, echoing the correlation ID', async () => {
      const id = randomUUID();
      const res = await request(app.getHttpServer())
        .get(`/orders/${id}`)
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
      await request(app.getHttpServer()).get('/orders/not-a-uuid').expect(400);
    });
  });

  describe('GET /orders', () => {
    it('defaults to limit 20, offset 0', async () => {
      const res = await request(app.getHttpServer()).get('/orders').expect(200);
      expect(res.body).toMatchObject({ limit: 20, offset: 0 });
    });

    it('converts query strings to numbers and pages the result', async () => {
      const res = await request(app.getHttpServer()).get('/orders?limit=1&offset=1').expect(200);
      const body = res.body as { items: unknown[]; limit: number; offset: number };
      expect(body.limit).toBe(1);
      expect(body.offset).toBe(1);
      expect(body.items).toHaveLength(1);
    });

    it('rejects a page size above 100', async () => {
      await request(app.getHttpServer()).get('/orders?limit=101').expect(400);
    });
  });
});
