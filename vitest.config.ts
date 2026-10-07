import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 1,
    setupFiles: ['tests/setup.ts'],
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'https://www.counter-strike.net/vacnet/clips' } },
    include: ['tests/**/*.test.ts'],
  },
});
