import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createGateway, TEST_JWT, tokenFor } from './test-app';

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('api-gateway JWT authentication (e2e)', () => {
  let orderService: Server;
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Any protected route needs a downstream to reach once auth passes.
    orderService = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"items":[]}');
    });
    await new Promise<void>((resolve) => orderService.listen(0, '127.0.0.1', resolve));
    const { port } = orderService.address() as AddressInfo;
    app = await createGateway({ ORDER_SERVICE_URL: `http://127.0.0.1:${port}` });
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => orderService.close(resolve));
  });

  const getOrders = (authorization?: string) => {
    const req = request(app.getHttpServer()).get('/orders');
    return authorization ? req.set('authorization', authorization) : req;
  };

  it('rejects a request without a token: 401 problem+json and WWW-Authenticate', async () => {
    const res = await getOrders()
      .expect(401)
      .expect('www-authenticate', 'Bearer')
      .expect('content-type', /application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('accepts a token from the dev token endpoint', async () => {
    const issued = await request(app.getHttpServer())
      .post('/auth/token')
      .send({ sub: 'c-42' })
      .expect(200);
    expect(issued.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });

    const body = issued.body as { accessToken: string };
    await getOrders(`Bearer ${body.accessToken}`).expect(200);
  });

  it('rejects an expired token', async () => {
    const expired = tokenFor(app, 'c-42', { expiresIn: -10 });
    await getOrders(`Bearer ${expired}`)
      .expect(401)
      .expect('www-authenticate', 'Bearer error="invalid_token"');
  });

  it('rejects a token signed with another secret', async () => {
    const forged = tokenFor(app, 'c-42', { secret: 'attacker-chosen-secret-32-characters!' });
    await getOrders(`Bearer ${forged}`).expect(401);
  });

  it('rejects a token issued for another audience', async () => {
    await getOrders(`Bearer ${tokenFor(app, 'c-42', { audience: 'billing-api' })}`).expect(401);
  });

  it('rejects an unsigned "alg: none" token even with correct claims', async () => {
    const claims = {
      sub: 'admin',
      iss: TEST_JWT.issuer,
      aud: TEST_JWT.audience,
      exp: Math.floor(Date.now() / 1000) + 600,
    };
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(claims)}.`;
    await getOrders(`Bearer ${unsigned}`).expect(401);
  });

  it('keeps health public for probes', async () => {
    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });

  it('validates the dev token request body', async () => {
    await request(app.getHttpServer()).post('/auth/token').send({ sub: 'bad sub!' }).expect(400);
  });
});
