import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Send /api to the Express server so the session cookie stays on the same site.
  // API_PROXY lets the E2E tests point at their own server.
  server: {
    proxy: {
      '/api': process.env.API_PROXY || 'http://127.0.0.1:8000',
    },
  },
})
