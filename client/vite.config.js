import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiProxyTarget = process.env.DLAS_API_PROXY_TARGET || 'http://localhost:3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false,
    testTimeout: 15000
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
});
