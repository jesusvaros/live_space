import { defineConfig, devices } from '@playwright/test';

// The app (vite.config.ts) on 43917 and the public web (vite.site.config.ts)
// on 43918; tests/e2e/legal.spec.ts uses the second one through SITE_URL.
export const SITE_URL = 'http://127.0.0.1:43918';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:43917',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 43917 --strictPort',
      url: 'http://127.0.0.1:43917/welcome',
      reuseExistingServer: false,
    },
    {
      command: 'npm run site:dev -- --host 127.0.0.1 --port 43918 --strictPort',
      url: `${SITE_URL}/privacidad`,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
