import { validateEnv } from './env.validation';

const validEnv = {
  NODE_ENV: 'test',
  ORDER_SERVICE_PORT: '4000',
  ORDER_DATABASE_URL: 'postgresql://user:pw@localhost:5432/orders',
  KAFKA_BROKERS: 'localhost:9092',
};

describe('validateEnv', () => {
  it('returns typed config with the port converted to a number', () => {
    const env = validateEnv(validEnv);
    expect(env.ORDER_SERVICE_PORT).toBe(4000);
    expect(env.ORDER_DATABASE_URL).toBe(validEnv.ORDER_DATABASE_URL);
    expect(env.NODE_ENV).toBe('test');
  });

  it('applies defaults for optional variables', () => {
    const env = validateEnv({
      ORDER_DATABASE_URL: validEnv.ORDER_DATABASE_URL,
      KAFKA_BROKERS: validEnv.KAFKA_BROKERS,
    });
    expect(env.ORDER_SERVICE_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.KAFKA_CLIENT_ID).toBe('order-service');
    expect(env.KAFKA_GROUP_ID).toBe('order-service');
  });

  it('drops variables that are not part of the schema', () => {
    const env = validateEnv({ ...validEnv, PATH: '/usr/bin' });
    expect(Object.keys(env)).not.toContain('PATH');
  });

  it('fails fast when the database URL is missing', () => {
    expect(() => validateEnv({ NODE_ENV: 'test' })).toThrow(/ORDER_DATABASE_URL/);
  });

  it('reports every invalid variable in one error', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'staging', ORDER_SERVICE_PORT: 'abc', ORDER_DATABASE_URL: 'x' }),
    ).toThrow(/NODE_ENV[\s\S]*ORDER_SERVICE_PORT[\s\S]*ORDER_DATABASE_URL/);
  });

  it('rejects a port outside 1-65535', () => {
    expect(() => validateEnv({ ...validEnv, ORDER_SERVICE_PORT: '70000' })).toThrow(
      /ORDER_SERVICE_PORT/,
    );
  });

  it('never echoes values in the error message (they may hold credentials)', () => {
    const secret = 'mysql://admin:s3cr3t-pass@db/orders';
    let message = '';
    try {
      validateEnv({ ORDER_DATABASE_URL: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/ORDER_DATABASE_URL/);
    expect(message).not.toContain('s3cr3t-pass');
  });

  it('splits a comma-separated broker list and trims spaces', () => {
    const env = validateEnv({ ...validEnv, KAFKA_BROKERS: 'kafka-0:9092, kafka-1:9092' });
    expect(env.KAFKA_BROKERS).toEqual(['kafka-0:9092', 'kafka-1:9092']);
  });

  it('fails fast when no Kafka broker is configured', () => {
    expect(() => validateEnv({ ...validEnv, KAFKA_BROKERS: undefined })).toThrow(/KAFKA_BROKERS/);
  });

  it('rejects a broker without a port', () => {
    expect(() => validateEnv({ ...validEnv, KAFKA_BROKERS: 'localhost' })).toThrow(
      /KAFKA_BROKERS entries must be host:port/,
    );
  });
});
