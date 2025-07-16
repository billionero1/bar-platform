// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),

    /* ——— PWA / service-worker ——— */
    VitePWA({
      registerType: 'autoUpdate',    // SW будет обновляться автоматически
      includeAssets: ['icons/*.png'], // что класть в кеш помимо бандла
      manifest: {
        name:            'Ingredient Platform',
        short_name:      'Ingredients',
        start_url:       '/',
        display:         'standalone',
        background_color:'#ffffff',
        theme_color:     '#ffffff',
        icons: [
          {
            src:  '/icons/icon-192.png',
            sizes:'192x192',
            type: 'image/png'
          },
          {
            src:  '/icons/icon-512.png',
            sizes:'512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // сразу активировать новый SW без ожидания
        skipWaiting: true,
        // новый SW сразу возьмёт под контроль все клиенты
        clientsClaim: true,
        // удалять устаревшие кеши
        cleanupOutdatedCaches: true,
        // fallback на корень для навигационных запросов
        navigateFallback: '/',
      }
    })
  ]
});
