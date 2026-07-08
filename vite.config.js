import { defineConfig } from 'vite';

/**
 * Frontend on :3000, FastAPI on :8080.
 * Relative fetch('/api/...') stays same-origin; Vite proxies to the backend.
 */
export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    host: '127.0.0.1',
    // Prefer 3000; if Cursor/Live Preview holds it, Vite will take the next free port.
    port: 3000,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/banners': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
});
