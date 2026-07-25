import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icon.png'],
      manifest: {
        name: 'VitaScan',
        short_name: 'VitaScan',
        description: 'Táplálkozás-követő és vonalkód-szkenner alkalmazás',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fcf8f8',
        theme_color: '#FF9A6C',
        lang: 'hu',
        icons: [
          { src: '/favicon.png', sizes: '48x48', type: 'image/png' },
          { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/auth') || url.port === '3005',
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    host: true,
  },
});
