// frontend/vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const API = env.VITE_API_URL || ''; // если пусто — используем dev-proxy

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: API ? undefined : {
        '/v1': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
