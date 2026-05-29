import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'path'
import manifest from './public/manifest.json'

export default defineConfig({
  plugins: [
    vue(),
    crx({
      manifest,
      browser: 'chrome',
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'chrome110',
    rollupOptions: {
      input: {
        offscreen: 'src/offscreen/index.html',
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
})
