import {spawnSync} from 'node:child_process'

const env = {
  ...process.env,
  VITE_BASE:'/',
  VITE_GOOGLE_CLIENT_ID:'browser-test.apps.googleusercontent.com',
  VITE_GOOGLE_API_KEY:'mock-browser-key',
  VITE_GOOGLE_PROJECT_NUMBER:'123456',
  TEST_MOCK_DRIVE:'1',
}
for (const [command,args] of [
  ['vite',['build','--outDir','dist-mock']],
  ['playwright',['test','tests/e2e/drive.spec.ts']],
]) {
  const result = spawnSync(process.execPath,
    [command === 'vite' ? 'node_modules/vite/bin/vite.js' : 'node_modules/@playwright/test/cli.js',...args],
    {env,stdio:'inherit'},
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
