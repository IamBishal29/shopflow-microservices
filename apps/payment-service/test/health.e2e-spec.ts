import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './test-app';

describe('Health endpoints (e2e)', () => {
  // Stand-in for Postgres: these tests cover the HTTP wiring and status codes.
  // Real-database tests arrive with Testcontainers (#22).
  const prisma = {
    $queryRaw: jest.fn<Promise<unknown>, []>(),
    onModuleInit: jest.fn(),
    onApplicationShutdown: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(PrismaService).useValue(prisma),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 even when the database is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('GET /health/ready returns 200 when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } });
  });

  it('GET /health/ready returns 503 when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(res.body).toMatchObject({ status: 'error', error: { database: { status: 'down' } } });
  });
});
