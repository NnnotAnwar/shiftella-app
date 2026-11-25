/**
 * OPTIONAL read-only smoke test of the deployed preprod (dev.shiftella.app +
 * preprod Supabase) — `corepack yarn e2e:remote`, see docs/e2e.md.
 *
 * It signs in with the test account the OWNER created for this (an org owner),
 * walks the main screens and the billing page, and signs out. It never creates
 * or changes data. Without the env vars the tests skip themselves.
 */
import { test, expect, type Page } from '@playwright/test';
import { en } from '../../src/shared/i18n/translations';

const EMAIL = process.env.E2E_REMOTE_EMAIL;
const PASSWORD = process.env.E2E_REMOTE_PASSWORD;

// dev.shiftella.app is behind basic auth; another E2E_REMOTE_URL may not be.
const REACHABLE = !!process.env.E2E_BASIC_AUTH || !!process.env.E2E_REMOTE_URL;

/** Fails the test on CSP violations / uncaught errors, like the local suite. */
function watch(page: Page) {
    const problems: string[] = [];
    page.on('console', (m) => {
        if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) problems.push(`CSP: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    return problems;
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        if (!localStorage.getItem('language')) localStorage.setItem('language', 'en');
    });
});

test('owner test account: sign in, main screens, billing, sign out — no CSP violations', async ({ page }) => {
    test.skip(!REACHABLE || !EMAIL || !PASSWORD, 'Set E2E_BASIC_AUTH + E2E_REMOTE_EMAIL / E2E_REMOTE_PASSWORD — docs/e2e.md');
    const problems = watch(page);

    await page.goto('/login');
    await page.locator('#login').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: en['auth.signIn'], exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);

    for (const path of ['/', '/schedule', '/overview', '/requests', '/settings']) {
        await page.goto(path);
        await expect(page.locator('main').first(), path).toBeVisible();
    }

    // Free beta: the billing page offers nothing to buy.
    await page.goto('/billing');
    await expect(page.getByText(en['billing.betaHint'])).toBeVisible();
    await expect(page.getByRole('heading', { name: en['billing.plans'] })).toHaveCount(0);

    const logout = page.getByRole('button', { name: en['nav.logout'] }).first();
    await logout.click();
    await expect(page.locator('#login, a[href="/login"]').first()).toBeVisible();

    expect(problems).toEqual([]);
});

test('the public pages load under the enforced CSP', async ({ page }) => {
    test.skip(!REACHABLE, 'Set E2E_BASIC_AUTH — docs/e2e.md');
    const problems = watch(page);
    for (const path of ['/', '/login', '/signup', '/privacy']) {
        const res = await page.goto(path);
        expect(res?.headers()['content-security-policy'], path).toBeTruthy();
        await page.waitForLoadState('networkidle');
    }
    expect(problems).toEqual([]);
});
