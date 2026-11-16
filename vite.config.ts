import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/places': {
        target: 'https://places.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/places/, ''),
      },
      '/api/mp': {
        target: 'https://api.mercadopago.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mp/, ''),
      },
    },
  },
});