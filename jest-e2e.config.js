/** E2E tests: apps/<service>/test/*.e2e-spec.ts, booting the Nest app with Supertest. */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  roots: ['<rootDir>/apps'],
  testMatch: ['<rootDir>/apps/*/test/**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/apps/order-service/test/setup-env.ts'],
  moduleNameMapper: {
    // Generated Prisma client uses ESM-style '.js' specifiers for its .ts files.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@shopflow/([^/]+)$': '<rootDir>/libs/$1/src',
  },
};
