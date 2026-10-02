import { defineConfig, devices } from '@playwright/test'

const port = process.env.PORT ?? '3000'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './dev',
  // e2e runs against `next dev`: the first request to each dynamic route compiles it (15-20s cold),
  // and a single test touches several routes.
  timeout: 120_000,
  testMatch: '**/e2e.spec.{ts,js}',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${port}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  webServer: {
    // Call next directly: `pnpm dev -- --port` forwards a literal `--` that Next does not treat as a flag
    // separator, so the server could ignore the port. PORT is set as well for good measure.
    command: `pnpm exec next dev dev --turbo --port ${port}`,
    env: {
      PORT: port,
    },
    reuseExistingServer: true,
    // A cold dev compile plus the Payload schema push on an empty database can exceed the 60s default.
    timeout: 180_000,
    url: `http://localhost:${port}/admin`,
  },
})
