import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA installable (NF4), lecture hors-ligne via cache réseau-d'abord des GET API (NF3).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Bailo',
        short_name: 'Bailo',
        description: 'Gestion locative — cités et immeubles',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Police Inter (alphabets latins seulement) préchargée : l'app garde son
        // apparence hors-ligne au lieu de retomber sur la police système.
        globPatterns: ['**/*.{js,css,html,svg}', 'assets/inter-latin-*.woff2'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
  // En dev, le front appelle /api/v1 en relatif : on relaie vers l'API NestJS (:3000).
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
