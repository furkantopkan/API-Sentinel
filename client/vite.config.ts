import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Where the dev server forwards `/api/*` requests.
 * Override with API_PROXY_TARGET when the backend runs on another port.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Fail instead of silently picking another port if 5173 is taken.
    strictPort: true,
    // Dev proxy: the browser calls /api on the Vite origin (same origin → no CORS),
    // and Vite forwards the request to the backend behind the scenes.
    proxy: {
      '/api': { target: apiProxyTarget },
    },
  },
});
