import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Tests e2e : nécessitent une base Postgres joignable via DATABASE_URL
// (docker compose up postgres). Non exécutés en CI sans service DB.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e.spec.ts'],
    root: '.',
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  plugins: [swc.vite()],
});
