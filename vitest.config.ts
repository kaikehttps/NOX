import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/desktop/src/**/*.test.ts', 'services/api/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Requer emuladores: npm run test:rules
        test: {
          name: 'rules',
          include: ['firebase/tests/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
      {
        // Requer emuladores: npm run test:api
        test: {
          name: 'api',
          include: ['services/api/test/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
