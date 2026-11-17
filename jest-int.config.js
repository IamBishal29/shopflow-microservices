/**
 * Integration tests: apps/<service>/test/*.int-spec.ts against real Postgres and Kafka
 * started by Testcontainers (needs Docker). Slower than unit tests, so a separate command.
 */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  roots: ['<rootDir>/apps'],
  testMatch: ['<rootDir>/apps/*/test/**/*.int-spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/int/global-setup.ts',
  globalTeardown: '<rootDir>/test/int/global-teardown.ts',
  testTimeout: 60_000,
  moduleNameMapper: {
    // Generated Prisma client uses ESM-style '.js' specifiers for its .ts files.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@shopflow/([^/]+)$': '<rootDir>/libs/$1/src',
  },
};
