import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import { DownstreamClient, DownstreamRequest } from './downstream.client';

const config = { get: () => 500 } as unknown as ConfigService<EnvironmentVariables, true>;
const post: DownstreamRequest = {
  baseUrl: 'http://orders:3001',
  method: 'POST',
  path: '/orders',
  headers: {
    'content-type': 'application/json',
    'x-correlation-id': 'req-1',
    cookie: 'session=secret',
    authorization: 'Bearer abc',
  },
  body: { customerId: 'c-1' },
};

describe('DownstreamClient', () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  const client = new DownstreamClient(config);

  afterEach(() => fetchMock.mockReset());
  afterAll(() => fetchMock.mockRestore());

  it('forwards only allowlisted headers and the JSON body, with a deadline', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
    await client.send(post);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://orders:3001/orders');
    expect(init?.headers).toEqual({
      'content-type': 'application/json',
      'x-correlation-id': 'req-1',
    });
    expect(init?.body).toBe('{"customerId":"c-1"}');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes downstream error statuses through unchanged', async () => {
    const problem = '{"code":"ORDER_NOT_FOUND"}';
    fetchMock.mockResolvedValue(
      new Response(problem, {
        status: 404,
        headers: { 'content-type': 'application/problem+json' },
      }),
    );
    const result = await client.send({ ...post, method: 'GET', body: undefined });
    expect(result.status).toBe(404);
    expect(result.contentType).toBe('application/problem+json');
    expect(result.body.toString()).toBe(problem);
  });

  it('maps a deadline hit to 504 Gateway Timeout', async () => {
    // Behaves like real fetch: rejects only once the given signal has fired.
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    await expect(client.send(post)).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('maps a refused or reset connection to 502 Bad Gateway', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(client.send(post)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
