import { defineConfig } from 'vite';
import path from 'node:path';

/**
 * Frontend on :3000, FastAPI on :8080.
 * Production: `npm run build` → dist/ (hashed /app/* bundles).
 * Relative fetch('/api/...') and '/crash/...' stay same-origin; Vite proxies to backend in dev.
 */
export default defineConfig({
  root: '.',
  publicDir: false,
  base: '/',
  plugins: [
    {
      name: 'tornado-strip-async-css-from-html',
      transformIndexHtml(html) {
        // Keep only the entry CSS in HTML. Route/overlay stylesheets load with their JS chunks.
        return html.replace(
          /<link rel="stylesheet"[^>]*href="\/app\/(?!index\.)[^"]+\.css"[^>]*>\s*/g,
          '',
        );
      },
    },
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'app',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    cssMinify: true,
    minify: 'esbuild',
    target: 'es2020',
    // Keep large branding SVGs as separate files (never data-URL inline).
    assetsInlineLimit: 4096,
    modulePreload: {
      polyfill: true,
      // Do not preload route/overlay chunks — load them only when opened.
      resolveDependencies(filename, deps) {
        return deps.filter(
          (dep) => !/\/(crash|dice|plinko|wallet|profile|balance)\.[^/]+\.js(?:$|\?)/.test(dep),
        );
      },
    },
    rollupOptions: {
      input: path.resolve('index.html'),
      output: {
        entryFileNames: 'app/[name].[hash].js',
        chunkFileNames: 'app/[name].[hash].js',
        assetFileNames: 'app/[name].[hash][extname]',
      },
    },
  },
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
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
});
