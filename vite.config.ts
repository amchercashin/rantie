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
  build: {
    rollupOptions: {
      output: {
        // The libraries change far less often than the app. In chunks of their own they keep
        // their file names from deploy to deploy, so an update downloads only the app's code
        // again (the service worker keeps every file whose name did not change).
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'react';
          if (/node_modules\/(dexie|dexie-react-hooks)\//.test(id)) return 'dexie';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    execArgv: noNodeWebStorage,
    // .claude/ holds other sessions' worktrees, each with its own tests and node_modules.
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**', '.claude/**'],
  },
});
