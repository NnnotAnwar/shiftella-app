import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests against the real app with the in-memory fake Supabase from
 * tools/screenshots — no backend, no secrets. `corepack yarn e2e` builds it
 * (dist-e2e) and serves it under the enforced production CSP (e2e/serve.mjs).
 * The optional suite against dev.shiftella.app has its own config:
 * playwright.remote.config.ts (see docs/e2e.md).
 */
const port = Number(process.env.E2E_PORT ?? 4173);
const CI = !!process.env.CI;

export default defineConfig({
    testDir: 'e2e/local',
    fullyParallel: true,
    forbidOnly: CI,
    retries: CI ? 1 : 0,
    workers: CI ? 2 : undefined,
    reporter: CI ? [['github'], ['list']] : 'list',
    timeout: 30_000,
    expect: { timeout: 10_000 },
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        locale: 'en-US',
        timezoneId: 'Europe/Prague',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /auth\.spec\.ts/ },
    ],
    webServer: {
        // E2E_SKIP_BUILD=1 reuses an existing dist-e2e (fast local re-runs).
        command: process.env.E2E_SKIP_BUILD ? 'node e2e/serve.mjs' : 'corepack yarn e2e:build && node e2e/serve.mjs',
        url: `http://127.0.0.1:${port}/`,
        reuseExistingServer: !CI,
        timeout: 180_000,
        env: { E2E_PORT: String(port) },
    },
});
