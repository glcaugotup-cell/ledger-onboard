import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    pool: 'vmThreads',
  },
  server: {
    port: 5173,
    // Fail instead of silently moving to 5174 when 5173 is taken, so a second
    // (possibly stale or different-copy) dev server can't run unnoticed.
    strictPort: true,
    proxy: {
      // Frontend calls relative /api/* paths in dev; Vite proxies them to
      // the Express backend so no CORS/base-URL juggling is needed locally.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
