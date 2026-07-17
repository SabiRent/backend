import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./tests/setup.ts'],
    // integration tests share one Mongo/Redis instance — running spec files in
    // parallel would race on shared collections being cleared mid-test
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
