import { withCustomerId } from './bind-customer';

describe('withCustomerId', () => {
  it("replaces a spoofed customerId with the token's subject", () => {
    expect(withCustomerId({ customerId: 'victim', currency: 'EUR' }, 'c-42')).toEqual({
      customerId: 'c-42',
      currency: 'EUR',
    });
  });

  it('fills customerId when the client omits it', () => {
    expect(withCustomerId({ currency: 'EUR' }, 'c-42')).toEqual({
      currency: 'EUR',
      customerId: 'c-42',
    });
  });

  it('does not mutate the parsed request body', () => {
    const body = { customerId: 'victim' };
    withCustomerId(body, 'c-42');
    expect(body.customerId).toBe('victim');
  });

  it.each([[null], [['a']], ['text'], [undefined]])(
    'leaves a non-object body (%p) for order-service to reject',
    (body) => {
      expect(withCustomerId(body, 'c-42')).toBe(body);
    },
  );
});
