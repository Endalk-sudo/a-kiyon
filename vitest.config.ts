import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/*': path.resolve(__dirname, './src/*'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // All integration tests share a single Firebase emulator instance, so
    // parallel files race against the same mutable data and each other's
    // write-consistency. Run files serially for deterministic results.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      FIREBASE_EMULATOR: 'true',
      NEXT_PUBLIC_FIREBASE_EMULATOR: 'true',
    },
  },
});
