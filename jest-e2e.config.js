/** E2E tests: apps/<service>/test/*.e2e-spec.ts, booting the Nest app with Supertest. */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  roots: ['<rootDir>/apps'],
  testMatch: ['<rootDir>/apps/*/test/**/*.e2e-spec.ts'],
  transform: { '^.+\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@shopflow/contracts(|/.*)$': '<rootDir>/libs/contracts/src/$1',
  },
};
