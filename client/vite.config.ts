import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_DEMO=1 builds the self-contained hosted demo: relative paths, no service worker.
const DEMO = process.env.VITE_DEMO === '1';

export default defineConfig({
  base: DEMO ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: DEMO,
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Think Inspect — Think Healthcare and Safety',
        short_name: 'Think Inspect',
        description: 'Digital equipment inspections, certificates and compliance for wheelchairs and stretchers.',
        theme_color: '#0b1b2b',
        background_color: '#f6f6f3',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /\/api\/photos\//, handler: 'CacheFirst', options: { cacheName: 'photos', expiration: { maxEntries: 500 } } },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true, proxy: { '/api': 'http://localhost:4000' } },
  preview: { port: 4173, proxy: { '/api': 'http://localhost:4000' } },
  build: { chunkSizeWarningLimit: 1500, outDir: DEMO ? 'dist-demo' : 'dist' },
});
