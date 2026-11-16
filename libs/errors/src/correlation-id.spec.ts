import { correlationIdOrNew, isValidCorrelationId } from './correlation-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('correlation IDs', () => {
  it('accepts short plain IDs only', () => {
    expect(isValidCorrelationId('trace-123')).toBe(true);
    expect(isValidCorrelationId('has space')).toBe(false);
    expect(isValidCorrelationId('<script>')).toBe(false);
    expect(isValidCorrelationId('x'.repeat(129))).toBe(false);
    expect(isValidCorrelationId(['a', 'b'])).toBe(false);
  });

  it('keeps a valid caller ID', () => {
    expect(correlationIdOrNew('trace-123')).toBe('trace-123');
  });

  it.each([undefined, '', 'bad id\n', ['a', 'b']])('generates a UUID for %p', (value) => {
    expect(correlationIdOrNew(value)).toMatch(UUID);
  });
});
