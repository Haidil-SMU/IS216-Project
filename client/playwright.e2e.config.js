import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  testMatch: /3d-.*\.spec\.js/,
  timeout: 120000,
  expect: { timeout: 20000 }, // slow first login on a cold dev server
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})