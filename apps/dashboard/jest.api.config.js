/**
 * Jest for the plain-TypeScript parts of the dashboard — today, the axios layer
 * in `lib/`. The dashboard has no test runner of its own, and standing up
 * jest-environment-jsdom plus a Next transform for a file that never touches
 * the DOM is not worth it, so this borrows the API's Jest and ts-jest exactly
 * the way `apps/mobile/jest.offline.config.js` does.
 *
 * Run from the repo root:
 *   apps/api/node_modules/.bin/jest -c apps/dashboard/jest.api.config.js
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
};
