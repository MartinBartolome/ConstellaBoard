/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Für GitHub Pages wird die App unter /<Repo-Name>/ ausgeliefert.
// BASE_PATH wird im Deployment-Workflow gesetzt, lokal gilt "/".
const base = process.env.BASE_PATH ?? '/'

/** GitHub Pages kennt keine SPA-Weiterleitungen: 404.html = index.html */
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback-404',
    apply: 'build',
    closeBundle() {
      copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'))
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), spaFallback()],
  server: { port: 5173, host: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
})
