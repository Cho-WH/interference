import { defineConfig } from '@playwright/test';
import browserConfig from './playwright.config';

// Deployment checks the built output, separately from detailed source-module tests.
export default defineConfig(browserConfig, {
  testDir: './tests/smoke',
  timeout: 15_000,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'npm run preview -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
