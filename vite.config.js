import { defineConfig } from 'vite';

/**
 * Frontend on :3000, FastAPI on :8080.
 * Relative fetch('/api/...') and '/crash/...' stay same-origin; Vite proxies to the backend.
 */
export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: true,
      },
      // Crash REST + WebSocket live outside /api by design
      '/crash': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: true,
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
