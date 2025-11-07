// frontend/vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // читаем переменные окружения (VITE_*) из .env.*
  const env = loadEnv(mode, process.cwd(), '')
  const API = env.VITE_API_URL || '' // если пусто — включаем dev-proxy

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: API
        ? undefined
        : {
            '/v1': {
              target: 'http://127.0.0.1:3001',
              changeOrigin: true,
            },
          },
    },
  }
})
