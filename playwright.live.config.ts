import { defineConfig, devices } from '@playwright/test'

/** Tests gegen das echte Supabase-Backend (siehe .github/workflows/e2e-live.yml). */
const PORT = 4173

export default defineConfig({
  testDir: './tests/live',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
