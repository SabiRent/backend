import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/server.ts', './src/worker.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  tsconfig: 'tsconfig.build.json',
  copy: [
    {
      from: 'templates',
      to: 'dist',
    },
  ],
});
