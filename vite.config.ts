import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Relative base so the build works on GitHub Pages (/<repo>/) and locally.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), robots: resolve(__dirname, 'robots.html') } },
  },
});
