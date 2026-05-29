import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

/** Match farmer-backend PORT so the dev proxy does not ECONNREFUSE. */
function resolveBackendTarget () {
  if (process.env.VITE_API_PROXY_TARGET) {
    return process.env.VITE_API_PROXY_TARGET
  }
  const backendEnv = path.resolve(__dirname, '../farmer-backend/.env')
  try {
    const port = fs
      .readFileSync(backendEnv, 'utf8')
      .match(/^PORT\s*=\s*"?(\d+)"?/m)?.[1]
    if (port) return `http://localhost:${port}`
  } catch {
    // farmer-backend/.env optional in CI
  }
  return 'http://localhost:3000'
}

const backendTarget = resolveBackendTarget()

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      scope: '/volunteer/',
      base: '/',
      includeAssets: [],
      manifest: false,
      workbox: {
        globPatterns: [],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/volunteer'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pannai-volunteer-shell',
              expiration: { maxEntries: 10, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('/delivery') && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pannai-delivery-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('/packing') && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pannai-packing-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('/dispatch') && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pannai-dispatch-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/webhook': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
