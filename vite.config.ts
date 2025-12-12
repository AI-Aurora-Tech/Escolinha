import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Polyfill process.env safely for libraries that expect it
    'process.env': {},
  },
  server: {
    proxy: {
      '/api/mp': {
        target: 'https://api.mercadopago.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mp/, ''),
      },
    },
  },
});