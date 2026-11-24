import { defineConfig, devices } from '@playwright/test';

/**
 * OPTIONAL smoke suite against the deployed preprod (dev.shiftella.app, preprod
 * Supabase). Read-only: it signs in with a test account the OWNER created and
 * only looks around — it never creates accounts, organizations or invites.
 * Every test skips itself unless the env vars below are set (docs/e2e.md):
 *   E2E_REMOTE_URL       default https://dev.shiftella.app
 *   E2E_BASIC_AUTH       "user:password" of the preprod basic auth
 *   E2E_REMOTE_EMAIL     the owner-created test account (an org owner)
 *   E2E_REMOTE_PASSWORD  its password
 */
const [user, ...rest] = (process.env.E2E_BASIC_AUTH ?? '').split(':');

export default defineConfig({
    testDir: 'e2e/remote',
    retries: 1,
    workers: 1,
    reporter: 'list',
    timeout: 45_000,
    expect: { timeout: 15_000 },
    use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.E2E_REMOTE_URL ?? 'https://dev.shiftella.app',
        httpCredentials: user ? { username: user, password: rest.join(':') } : undefined,
        locale: 'en-US',
        timezoneId: 'Europe/Prague',
        trace: 'retain-on-failure',
    },
});
