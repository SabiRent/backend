import { fileURLToPath } from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    // Route the Redis config to an in-memory ioredis-mock during tests so the
    // suite never touches a real Redis (rate limiter + flushdb stay isolated).
    alias: {
      '@/config/redis.config': fileURLToPath(
        new URL('./tests/mocks/redis.config.ts', import.meta.url),
      ),
    },
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./tests/setup.ts'],
    // integration tests share one Mongo/Redis instance — running spec files in
    // parallel would race on shared collections being cleared mid-test
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
