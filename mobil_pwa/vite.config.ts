import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget =
    env.VITE_PROXY_TARGET ||
    process.env.VITE_PROXY_TARGET ||
    'http://192.168.1.115:3005';

  const apiProxy = {
    // Backend serves under /api — keep the prefix when proxying
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true,
    },
  };

  return {
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
          // Never treat /api/* as SPA routes (would redirect to login)
          navigateFallbackDenylist: [/^\/api(?:\/|$)/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/api') ||
                url.port === '3005',
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    server: {
      port: 5174,
      host: true,
      allowedHosts: ['vitascan.bdev.hu', '.bdev.hu'],
      proxy: apiProxy,
    },
    preview: {
      port: 4173,
      host: true,
      allowedHosts: ['vitascan.bdev.hu', '.bdev.hu'],
      proxy: apiProxy,
    },
  };
});
