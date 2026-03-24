import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:8081',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
  ],
  webServer: {
    command: 'npx expo start --web --port 8081',
    cwd: '..',
    port: 8081,
    timeout: 60_000,
    reuseExistingServer: true,
  },
});
