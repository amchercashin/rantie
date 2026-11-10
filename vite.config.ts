/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const base = process.env.BASE_URL ?? '/';

// Node 25+ has its own global `localStorage` (undefined without --localstorage-file).
// Vitest 4 then keeps it instead of happy-dom's, so tests see no localStorage.
// Turn Node's Web Storage off in test workers; drop this after moving to Vitest 5.
const nodeFlags = process.allowedNodeEnvironmentFlags;
const noNodeWebStorage = nodeFlags.has('--webstorage')
  ? ['--no-webstorage']
  : nodeFlags.has('--experimental-webstorage')
    ? ['--no-experimental-webstorage']
    : [];

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Рантье — пассивный доход',
        short_name: 'Рантье',
        description: 'Сколько денег в месяц приносит ваш капитал: акции, облигации, фонды, вклады, недвижимость',
        lang: 'ru',
        theme_color: '#0b0a08',
        background_color: '#0b0a08',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          { src: `${base}icon.svg`, sizes: 'any', type: 'image/svg+xml' },
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}icon-maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: `${base}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Only Latin + Cyrillic font subsets are needed offline.
        globIgnores: ['**/*-greek-*', '**/*-vietnamese-*'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    execArgv: noNodeWebStorage,
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
