import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['tests/setup.ts'],
    // Run test files sequentially — integration tests share a DB and must not
    // run concurrently or they'd clobber each other's data.
    fileParallelism: false,
  },
});
