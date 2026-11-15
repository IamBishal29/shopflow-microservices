import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('api-gateway (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('GET /health/ready returns 200 without any downstream service running', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('answers unknown routes with the shared problem+json body', async () => {
    const res = await request(app.getHttpServer())
      .get('/nope')
      .set('x-correlation-id', 'req-42')
      .expect(404)
      .expect('content-type', /application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'about:blank',
      status: 404,
      code: 'NOT_FOUND',
      instance: '/nope',
      correlationId: 'req-42',
    });
  });
});
