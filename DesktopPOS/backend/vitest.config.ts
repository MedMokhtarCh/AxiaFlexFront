import { defineConfig } from 'vitest/config';

/**
 * Tests d'intégration HTTP + Postgres.
 * Utiliser une base dédiée (ex. posdb_test) : DATABASE_URL ou DB_* au lancement de `npm test`.
 * fileParallelism: false évite les courses sur la même base.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    maxConcurrency: 1,
    pool: 'forks',
  },
});
