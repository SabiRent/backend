import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    // Tests run against real MongoDB + Redis (docker-compose locally, service
    // containers in CI) — see tests/setup.ts. No infrastructure is mocked.
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./tests/setup.ts'],
    // integration tests share one Mongo/Redis instance — running spec files in
    // parallel would race on shared collections being cleared mid-test
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
