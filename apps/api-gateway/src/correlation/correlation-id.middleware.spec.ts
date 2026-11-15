import type { Request, Response } from 'express';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function run(headers: Record<string, string | string[]>) {
  const req = { headers: { ...headers } } as unknown as Request;
  const setHeader = jest.fn();
  const next = jest.fn();
  new CorrelationIdMiddleware().use(req, { setHeader } as unknown as Response, next);
  return { requestId: req.headers['x-correlation-id'], setHeader, next };
}

describe('CorrelationIdMiddleware', () => {
  it('reuses a well-formed incoming ID on the request and the response', () => {
    const { requestId, setHeader, next } = run({ 'x-correlation-id': 'client-req-1' });
    expect(requestId).toBe('client-req-1');
    expect(setHeader).toHaveBeenCalledWith('x-correlation-id', 'client-req-1');
    expect(next).toHaveBeenCalled();
  });

  it('generates a UUID when the header is missing', () => {
    const { requestId, setHeader } = run({});
    expect(requestId).toMatch(UUID);
    expect(setHeader).toHaveBeenCalledWith('x-correlation-id', requestId);
  });

  it('replaces an unsafe ID instead of forwarding it', () => {
    const { requestId } = run({ 'x-correlation-id': 'a b\r\nX-Admin: true' });
    expect(requestId).toMatch(UUID);
  });

  it('replaces a header sent twice (array) with a fresh UUID', () => {
    const { requestId } = run({ 'x-correlation-id': ['one', 'two'] });
    expect(requestId).toMatch(UUID);
  });
});
