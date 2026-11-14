import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { OrderNotFoundError, OrderTotalTooLargeError } from '../../orders/order.errors';
import { toProblem } from './problem-details';

describe('toProblem', () => {
  it('maps a not-found domain error to 404 with a stable type and code', () => {
    expect(toProblem(new OrderNotFoundError('abc'))).toEqual({
      type: 'urn:shopflow:problem:order-not-found',
      title: 'Order not found',
      status: 404,
      detail: 'Order abc not found',
      code: 'ORDER_NOT_FOUND',
    });
  });

  it('maps a business-rule violation to 422', () => {
    expect(toProblem(new OrderTotalTooLargeError(100))).toMatchObject({
      status: 422,
      code: 'ORDER_TOTAL_TOO_LARGE',
    });
  });

  it('turns ValidationPipe errors into VALIDATION_FAILED with the field messages', () => {
    const exception = new BadRequestException(['currency must be an ISO 4217 code like EUR']);
    expect(toProblem(exception)).toEqual({
      type: 'urn:shopflow:problem:validation-failed',
      title: 'Request validation failed',
      status: 400,
      detail: 'One or more fields are invalid.',
      code: 'VALIDATION_FAILED',
      errors: ['currency must be an ISO 4217 code like EUR'],
    });
  });

  it('maps other HTTP exceptions to about:blank with the standard reason phrase', () => {
    expect(toProblem(new NotFoundException('Cannot GET /nope'))).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Cannot GET /nope',
      code: 'NOT_FOUND',
    });
  });

  it('never exposes the detail of a 5xx HTTP exception', () => {
    const problem = toProblem(new InternalServerErrorException('db-prod-3 refused connection'));
    expect(problem).toMatchObject({ status: 500, code: 'INTERNAL_SERVER_ERROR' });
    expect(problem.detail).toBeUndefined();
  });

  it('respects http-errors client errors from Express middleware (malformed JSON)', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      status: 400,
      expose: true,
    });
    expect(toProblem(parseError)).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });

  it('answers unknown errors with a bare 500 and no message', () => {
    const problem = toProblem(new Error('password=hunter2 in connection string'));
    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
    });
  });
});
