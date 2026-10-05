import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Relative base so the build works on GitHub Pages (/<repo>/) and locally.
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },   // shown by ?diag, to tell which build a browser is running
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), robots: resolve(__dirname, 'robots.html'), talk: resolve(__dirname, 'talk.html') } },
  },
});
