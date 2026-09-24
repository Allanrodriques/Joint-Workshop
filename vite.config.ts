import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    cssTarget: 'chrome79',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
    port: 5173,
  },
});
