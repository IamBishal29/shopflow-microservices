import { validateEnv } from './env.validation';

const validEnv = {
  NODE_ENV: 'test',
  NOTIFICATION_SERVICE_PORT: '4003',
  NOTIFICATION_DATABASE_URL: 'postgresql://user:pw@localhost:5432/notifications',
};

describe('validateEnv', () => {
  it('returns typed config with the port converted to a number', () => {
    const env = validateEnv(validEnv);
    expect(env.NOTIFICATION_SERVICE_PORT).toBe(4003);
    expect(env.NOTIFICATION_DATABASE_URL).toBe(validEnv.NOTIFICATION_DATABASE_URL);
  });

  it('defaults the port to 3003 and NODE_ENV to development', () => {
    const env = validateEnv({ NOTIFICATION_DATABASE_URL: validEnv.NOTIFICATION_DATABASE_URL });
    expect(env.NOTIFICATION_SERVICE_PORT).toBe(3003);
    expect(env.NODE_ENV).toBe('development');
  });

  it('fails fast without a database URL, naming the variable but not echoing values', () => {
    expect(() => validateEnv({ NOTIFICATION_DATABASE_URL: 'mysql://secret@db/x' })).toThrow(
      /NOTIFICATION_DATABASE_URL must be a postgresql/,
    );
    expect(() => validateEnv({ NOTIFICATION_DATABASE_URL: 'mysql://secret@db/x' })).not.toThrow(
      /secret/,
    );
    expect(() => validateEnv({})).toThrow(/NOTIFICATION_DATABASE_URL/);
  });

  it('drops variables that are not part of the schema', () => {
    const env = validateEnv({ ...validEnv, PATH: '/usr/bin' });
    expect(Object.keys(env)).not.toContain('PATH');
  });
});
