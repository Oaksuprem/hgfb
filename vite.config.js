import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'node:path'
import { issueHostPlugin } from './src/vite-issue-host.js'

export default defineConfig({
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        issue: resolve(import.meta.dirname, 'issue.html'),
      },
    },
  },
  plugins: [
    issueHostPlugin(),
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'stream', 'util', 'crypto', 'events', 'string_decoder'],
      globals: { Buffer: true, global: true, process: true },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      devOptions: { enabled: true, type: 'module', suppressWarnings: true },
      manifest: {
        id: '/',
        name: "HGFB — Hell's Gate Finance Bank",
        short_name: 'HGFB',
        description: "A new age of payment, investment, and access to global investment opportunities.",
        theme_color: '#0a0908',
        background_color: '#0a0908',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['finance', 'utilities'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  optimizeDeps: { include: ['xrpl'] },
})
