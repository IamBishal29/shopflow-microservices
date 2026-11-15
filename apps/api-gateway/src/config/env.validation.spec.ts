import { validateEnv } from './env.validation';

const validEnv = {
  NODE_ENV: 'test',
  GATEWAY_PORT: '4000',
  ORDER_SERVICE_URL: 'http://order-service:3001',
  JWT_SECRET: 'test-secret-that-is-at-least-32-chars',
};

describe('validateEnv', () => {
  it('returns typed config with numbers converted', () => {
    const env = validateEnv({ ...validEnv, DOWNSTREAM_TIMEOUT_MS: '1500' });
    expect(env.GATEWAY_PORT).toBe(4000);
    expect(env.DOWNSTREAM_TIMEOUT_MS).toBe(1500);
    expect(env.ORDER_SERVICE_URL).toBe('http://order-service:3001');
  });

  it('applies defaults for optional variables', () => {
    const env = validateEnv({
      ORDER_SERVICE_URL: validEnv.ORDER_SERVICE_URL,
      JWT_SECRET: validEnv.JWT_SECRET,
    });
    expect(env.GATEWAY_PORT).toBe(3000);
    expect(env.JWT_ISSUER).toBe('shopflow-gateway');
    expect(env.JWT_AUDIENCE).toBe('shopflow-api');
    expect(env.JWT_TTL_SECONDS).toBe(900);
    expect(env.DOWNSTREAM_TIMEOUT_MS).toBe(3_000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('strips trailing slashes from the downstream URL', () => {
    const env = validateEnv({ ...validEnv, ORDER_SERVICE_URL: 'http://localhost:3001//' });
    expect(env.ORDER_SERVICE_URL).toBe('http://localhost:3001');
  });

  it('fails fast when ORDER_SERVICE_URL is missing or not http(s)', () => {
    expect(() => validateEnv({})).toThrow(/ORDER_SERVICE_URL/);
    expect(() => validateEnv({ ...validEnv, ORDER_SERVICE_URL: 'ftp://files:21' })).toThrow(
      /ORDER_SERVICE_URL/,
    );
  });

  it('fails fast without a JWT secret or with a short one', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET must be at least 32 characters/,
    );
  });

  it('rejects a timeout outside 100 ms - 30 s', () => {
    expect(() => validateEnv({ ...validEnv, DOWNSTREAM_TIMEOUT_MS: '0' })).toThrow(
      /DOWNSTREAM_TIMEOUT_MS/,
    );
    expect(() => validateEnv({ ...validEnv, DOWNSTREAM_TIMEOUT_MS: '60000' })).toThrow(
      /DOWNSTREAM_TIMEOUT_MS/,
    );
  });

  it('never echoes values in the error message', () => {
    expect(() => validateEnv({ ORDER_SERVICE_URL: 'http://user:s3cret@bad host' })).toThrow(
      /^(?![\s\S]*s3cret)/,
    );
  });
});
