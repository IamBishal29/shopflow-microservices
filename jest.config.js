/** Unit tests: *.spec.ts next to the code under apps/ and libs/. */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  roots: ['<rootDir>/apps', '<rootDir>/libs'],
  testMatch: ['<rootDir>/apps/*/src/**/*.spec.ts', '<rootDir>/libs/*/src/**/*.spec.ts'],
  transform: { '^.+\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  collectCoverageFrom: ['**/src/**/*.ts', '!**/main.ts'],
  coverageDirectory: '<rootDir>/coverage',
  moduleNameMapper: {
    '^@shopflow/contracts(|/.*)$': '<rootDir>/libs/contracts/src/$1',
  },
};
