// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_URL || '';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // удобный dev-прокси: если VITE_API_URL не задан, шлём на локальный бэк
    proxy: API ? undefined : {
      '/v1': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  // для некоторых либ, ожидающих process.env
  define: {
    'process.env': {},
  },
});
