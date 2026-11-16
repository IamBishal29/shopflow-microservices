import { UnauthorizedException } from '@nestjs/common';
import { customerIdFrom } from './customer-id.decorator';

describe('customerIdFrom', () => {
  it('accepts a JWT-subject-like id', () => {
    expect(customerIdFrom('auth0|c-42')).toBe('auth0|c-42');
  });

  it.each([
    ['a missing header', undefined],
    ['an empty value', ''],
    ['a value with spaces', 'c 42'],
    ['a repeated header', ['c-1', 'c-2']],
    ['an over-long value', 'c'.repeat(256)],
  ])('rejects %s with 401 instead of reading every order', (_, value) => {
    expect(() => customerIdFrom(value)).toThrow(UnauthorizedException);
  });
});
