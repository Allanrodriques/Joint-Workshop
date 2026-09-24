import { defineConfig } from 'vite';
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";


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
  plugins: [cloudflare()],
});
