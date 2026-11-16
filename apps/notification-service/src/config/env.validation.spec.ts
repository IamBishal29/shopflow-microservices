import { validateEnv } from './env.validation';

const validEnv = {
  NODE_ENV: 'test',
  NOTIFICATION_SERVICE_PORT: '4003',
  NOTIFICATION_DATABASE_URL: 'postgresql://user:pw@localhost:5432/notifications',
  KAFKA_BROKERS: 'localhost:9092',
};

describe('validateEnv', () => {
  it('returns typed config with the port converted to a number', () => {
    const env = validateEnv(validEnv);
    expect(env.NOTIFICATION_SERVICE_PORT).toBe(4003);
    expect(env.NOTIFICATION_DATABASE_URL).toBe(validEnv.NOTIFICATION_DATABASE_URL);
  });

  it('defaults the port, NODE_ENV, Kafka client/group and retry policy', () => {
    const env = validateEnv({
      NOTIFICATION_DATABASE_URL: validEnv.NOTIFICATION_DATABASE_URL,
      KAFKA_BROKERS: ' kafka-0:9092, kafka-1:9092 ',
    });
    expect(env.NOTIFICATION_SERVICE_PORT).toBe(3003);
    expect(env.NODE_ENV).toBe('development');
    expect(env.KAFKA_BROKERS).toEqual(['kafka-0:9092', 'kafka-1:9092']);
    expect(env.KAFKA_CLIENT_ID).toBe('notification-service');
    expect(env.KAFKA_GROUP_ID).toBe('notification-service');
    expect(env.CONSUMER_MAX_ATTEMPTS).toBe(4);
    expect(env.CONSUMER_RETRY_BASE_MS).toBe(1_000);
  });

  it('requires KAFKA_BROKERS as host:port entries', () => {
    expect(() => validateEnv({ ...validEnv, KAFKA_BROKERS: undefined })).toThrow(/KAFKA_BROKERS/);
    expect(() => validateEnv({ ...validEnv, KAFKA_BROKERS: 'kafka' })).toThrow(/host:port/);
  });

  it('fails fast without a database URL, naming the variable but not echoing values', () => {
    const bad = { ...validEnv, NOTIFICATION_DATABASE_URL: 'mysql://secret@db/x' };
    expect(() => validateEnv(bad)).toThrow(/NOTIFICATION_DATABASE_URL must be a postgresql/);
    expect(() => validateEnv(bad)).not.toThrow(/secret/);
    expect(() => validateEnv({ KAFKA_BROKERS: 'localhost:9092' })).toThrow(
      /NOTIFICATION_DATABASE_URL/,
    );
  });

  it('drops variables that are not part of the schema', () => {
    const env = validateEnv({ ...validEnv, PATH: '/usr/bin' });
    expect(Object.keys(env)).not.toContain('PATH');
  });
});
