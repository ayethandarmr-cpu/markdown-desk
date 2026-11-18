import {defineConfig} from '@playwright/test'
export default defineConfig({
  testDir:'tests/e2e', workers:2, use:{
    baseURL:'http://127.0.0.1:4173', browserName:'chromium',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE},
  },
  webServer:{
    command:'npm run preview -- --port 4173 --strictPort' + (process.env.TEST_MOCK_DRIVE === '1' ? ' --outDir dist-mock' : ''),url:'http://127.0.0.1:4173',
    reuseExistingServer:false,
  },
})
