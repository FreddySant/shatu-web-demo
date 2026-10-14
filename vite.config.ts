import { defineConfig } from 'vite';

// The site is served from https://<user>.github.io/shatu-web-demo/
export default defineConfig({
  base: '/shatu-web-demo/',
  test: {
    environment: 'node',
  },
});
