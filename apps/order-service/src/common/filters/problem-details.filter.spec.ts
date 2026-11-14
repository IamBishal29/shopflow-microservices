import { ArgumentsHost, Logger } from '@nestjs/common';
import { OrderNotFoundError } from '../../orders/order.errors';
import { ProblemDetailsFilter } from './problem-details.filter';

function fakeHost(headers: Record<string, string> = {}) {
  const response = {
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const request = {
    method: 'GET',
    originalUrl: '/orders/abc',
    header: (name: string) => headers[name.toLowerCase()],
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();
  const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  afterEach(() => logError.mockClear());
  afterAll(() => logError.mockRestore());

  it('writes problem+json with instance, timestamp and the status code', () => {
    const { host, response } = fakeHost();
    filter.catch(new OrderNotFoundError('abc'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.type).toHaveBeenCalledWith('application/problem+json');
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ORDER_NOT_FOUND',
        instance: '/orders/abc',
        timestamp: expect.any(String) as unknown,
      }),
    );
  });

  it('echoes a well-formed correlation ID', () => {
    const { host, response } = fakeHost({ 'x-correlation-id': 'req-123' });
    filter.catch(new OrderNotFoundError('abc'), host);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'req-123' }),
    );
  });

  it('drops a correlation ID that is not safe to echo', () => {
    const { host, response } = fakeHost({ 'x-correlation-id': '<script>alert(1)</script>' });
    filter.catch(new OrderNotFoundError('abc'), host);
    expect(response.json).toHaveBeenCalledWith(
      expect.not.objectContaining({ correlationId: expect.anything() as unknown }),
    );
  });

  it('logs unexpected errors with their stack', () => {
    const { host } = fakeHost();
    const boom = new Error('boom');
    filter.catch(boom, host);
    expect(logError).toHaveBeenCalledWith('GET /orders/abc failed', boom.stack);
  });

  it('does not log expected client errors as errors', () => {
    const { host } = fakeHost();
    filter.catch(new OrderNotFoundError('abc'), host);
    expect(logError).not.toHaveBeenCalled();
  });
});
