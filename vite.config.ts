import { configDefaults, defineConfig } from 'vitest/config';

// The site is served from https://<user>.github.io/shatu-web-demo/
export default defineConfig({
  base: '/shatu-web-demo/',
  test: {
    environment: 'node',
    // The tests in tests/cloud need the Firebase emulators; run them with `npm run test:cloud`.
    exclude: [...configDefaults.exclude, 'tests/cloud/**'],
  },
});
