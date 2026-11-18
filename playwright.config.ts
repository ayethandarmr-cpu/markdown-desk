import { defineConfig } from '@playwright/test'

// The e2e build uses fake Google settings; tests replace Google's scripts and APIs with mocks.
const env = 'VITE_GOOGLE_CLIENT_ID=test.apps.googleusercontent.com VITE_GOOGLE_API_KEY=test-key VITE_GOOGLE_PROJECT_NUMBER=123456'

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: {
    command: `${env} npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port 4173 --strictPort`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
