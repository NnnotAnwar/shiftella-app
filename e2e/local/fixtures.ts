/**
 * Shared setup for the local E2E suite.
 *
 * Every page starts with: English UI, the free beta ON (as in production
 * today), signed OUT (unless a test calls `signIn`), and every request that
 * isn't to the local server aborted — the fake Supabase never needs the
 * network, and web fonts just fall back.
 *
 * After each test the fixture fails it on any Content-Security-Policy
 * violation (the server sends the enforced production CSP) or uncaught page
 * error.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { en } from '../../src/shared/i18n/translations';
import { E2E_AUTH_KEY, E2E_OWNER, E2E_PASSWORD } from '../../tools/screenshots/fake/e2eConstants';

export { expect, en, E2E_OWNER, E2E_PASSWORD };

type Key = keyof typeof en;
/** The English UI string for a translation key, with `{name}` placeholders filled. */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
    return en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

interface Setup {
    /** `localStorage['demo-billing']`: 'beta' (default, like prod now) or another scenario; null = paid Business. */
    billing: string | null;
}

/** What the app sent to the fake backend so far (sign-ups, invites, …). */
export async function fakeCalls(page: Page, name?: string) {
    const calls = await page.evaluate(() => (window as unknown as { __fakeSupabase?: { calls: { name: string; args: unknown }[] } }).__fakeSupabase?.calls ?? []);
    return name ? calls.filter((c) => c.name === name) : calls;
}

/** The "emails" the fake backend sent (invite links). */
export async function outbox(page: Page) {
    return page.evaluate(() => (window as unknown as { __fakeSupabase?: { outbox: { to: string; kind: string; link: string }[] } }).__fakeSupabase?.outbox ?? []);
}

/** Starts the test signed in as a demo profile (default: the org owner), skipping the login form. */
export async function signIn(page: Page, profileId: string = E2E_OWNER.id) {
    await page.addInitScript(
        ([key, id]) => {
            if (sessionStorage.getItem('e2e-signed-in')) return;
            sessionStorage.setItem('e2e-signed-in', '1');
            localStorage.setItem(key, id);
        },
        [E2E_AUTH_KEY, profileId] as const,
    );
}

export const test = base.extend<Setup & { problems: string[] }>({
    billing: ['beta', { option: true }],
    problems: [
        async ({ page, billing }, use) => {
            const problems: string[] = [];
            // Chromium logs some violations to the console, but e.g. a blocked
            // eval/new Function only fires the DOM event — listen to both.
            page.on('console', (msg) => {
                if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) problems.push(`CSP: ${msg.text()}`);
            });
            await page.exposeFunction('__e2eCspViolation', (v: string) => problems.push(`CSP: ${v}`));
            await page.addInitScript(() => {
                document.addEventListener('securitypolicyviolation', (e) => {
                    const report = (window as unknown as { __e2eCspViolation: (v: string) => void }).__e2eCspViolation;
                    report(`${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile}:${e.lineNumber}`);
                });
            });
            page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
            await page.context().route(/^(?!http:\/\/127\.0\.0\.1[:/])/, (route) => route.abort());
            await page.addInitScript(
                ([authKey, billingScenario]) => {
                    // First load of this tab only: later loads keep what the app stored.
                    if (!localStorage.getItem('language')) localStorage.setItem('language', 'en');
                    if (!localStorage.getItem(authKey)) localStorage.setItem(authKey, 'none');
                    if (billingScenario) localStorage.setItem('demo-billing', billingScenario);
                    else localStorage.removeItem('demo-billing');
                },
                [E2E_AUTH_KEY, billing] as const,
            );
            await use(problems);
            expect(problems, 'CSP violations / page errors').toEqual([]);
        },
        { auto: true },
    ],
});
