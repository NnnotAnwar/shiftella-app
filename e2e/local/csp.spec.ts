import { test, expect, signIn, t } from './fixtures';

/**
 * The E2E server sends the CSP of deploy/hetzner/shiftella.caddy, enforced. The
 * auto fixture fails any test with a violation; these tests make sure that net
 * actually catches something and walk every main screen under it (the check
 * before switching prod from Report-Only to enforcing).
 */
test('the enforced production CSP is served, and a violation is caught', async ({ page, problems }) => {
    const res = await page.goto('/login');
    const csp = res?.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain('connect-src');

    await page.evaluate(() => {
        const s = document.createElement('script');
        s.textContent = 'window.__inline = 1';
        document.head.appendChild(s);
    });
    await expect.poll(() => problems.some((p) => p.startsWith('CSP:'))).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __inline?: number }).__inline)).toBeUndefined();
    problems.length = 0; // expected here — don't fail this test for it
});

const SCREENS = ['/', '/schedule', '/overview', '/announcements', '/requests', '/timesheets', '/notes', '/activity', '/admin', '/settings', '/billing', '/profile'];

test('every main screen renders under the enforced CSP without errors', async ({ page }) => {
    await signIn(page);
    for (const path of SCREENS) {
        await page.goto(path);
        await expect(page.locator('main').first(), path).toBeVisible();
        await page.waitForLoadState('networkidle');
    }
});

test('public pages render under the enforced CSP without errors', async ({ page }) => {
    for (const path of ['/', '/login', '/signup', '/forgot-password', '/privacy', '/terms']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).not.toBeEmpty();
    }
});

test('timesheet PDF + Excel exports work under the enforced CSP (blob:/data:, embedded font)', async ({ page }) => {
    await signIn(page);
    await page.goto('/timesheets');
    const exportAll = page.getByTitle(t('ts.exportAll'));
    for (const fmt of [/^PDF$/, /^Excel$/]) {
        await expect(exportAll).toBeEnabled();
        await exportAll.click();
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: fmt }).click();
        expect((await download).suggestedFilename()).toMatch(/\.(pdf|xlsx)$/);
    }
});
