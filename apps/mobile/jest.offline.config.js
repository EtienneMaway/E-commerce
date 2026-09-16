/**
 * Jest for the plain-TypeScript parts of the app (the offline queue and its
 * replay). The mobile app has no test runner of its own, and pulling in
 * jest-expo for two files is not worth it, so this borrows the API's Jest and
 * ts-jest and stands in for the two native storage modules those files touch.
 *
 * Run from the repo root:
 *   apps/api/node_modules/.bin/jest -c apps/mobile/jest.offline.config.js
 */
const path = require('path');

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      require.resolve('ts-jest', { paths: [path.join(__dirname, '../api')] }),
      {
        diagnostics: false,
        tsconfig: { module: 'commonjs', target: 'ES2020', esModuleInterop: true, strict: true },
      },
    ],
  },
  moduleNameMapper: {
    '^expo-secure-store$': '<rootDir>/__tests__/mocks/expo-secure-store.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__tests__/mocks/async-storage.ts',
  },
};
