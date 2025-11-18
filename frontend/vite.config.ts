// frontend/vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDev = mode === 'development'

  // В DEV — ТОЛЬКО прокси, чтобы Origin был один (http://localhost:5173)
  // В PROD — запрашиваем напрямую API по VITE_API_URL
  const API = isDev ? '' : (env.VITE_API_URL || '')

  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      host: 'localhost', // фиксируем host, чтобы не было 127.0.0.1
      port: 5173,
      strictPort: true,
      proxy: API ? undefined : {
        '/v1': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    define: { 'process.env': {} },
  }
})
