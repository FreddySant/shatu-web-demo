import { defineConfig } from 'vitest/config';

// Tests against the local Firebase emulators. `npm run test:cloud` starts them first.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/cloud/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // One emulator is shared, so the files run one after another.
    fileParallelism: false,
  },
});
