import { test, expect, t, fakeCalls, E2E_OWNER } from './fixtures';
import { LANDING } from '../../src/features/landing/landingContent';

/** Fills the owner sign-up form (the org is created server-side from `organization_name`). */
async function fillSignup(page: import('@playwright/test').Page, email: string, agree = true) {
    await page.locator('#org').fill('Bistro Na Rohu');
    await page.locator('#first').fill('Alena');
    await page.locator('#last').fill('Testová');
    await page.locator('#email').fill(email);
    await page.locator('#pw').fill('dlouhe-heslo-123');
    if (agree) await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: t('signup.submit') }).click();
}

test.describe('sign up (owner creates an organization)', () => {
    test('landing CTA → form → "check your email"; the org name goes to the sign-up', async ({ page }) => {
        await page.goto('/');
        // Free beta on: the hero CTA says so.
        const cta = page.getByRole('link', { name: LANDING.en.beta.cta }).first();
        await expect(cta).toBeVisible();
        await cta.click();
        await expect(page).toHaveURL(/\/signup$/);

        await fillSignup(page, 'alena@bistro.example');
        await expect(page.getByRole('heading', { name: t('signup.checkTitle') })).toBeVisible();
        await expect(page.getByText('alena@bistro.example')).toBeVisible();

        const [call] = await fakeCalls(page, 'auth.signUp');
        expect(call.args).toMatchObject({
            email: 'alena@bistro.example',
            data: { organization_name: 'Bistro Na Rohu', first_name: 'Alena', last_name: 'Testová', language: 'en' },
        });

        // "Back to sign in" carries the email over.
        await page.getByRole('link', { name: t('signup.backToLogin') }).click();
        await expect(page.locator('#login')).toHaveValue('alena@bistro.example');
    });

    test('the terms checkbox is required', async ({ page }) => {
        await page.goto('/signup');
        await fillSignup(page, 'alena@bistro.example', false);
        await expect(page.getByText(t('signup.agreeRequired'))).toBeVisible();
        expect(await fakeCalls(page, 'auth.signUp')).toHaveLength(0);
    });

    test('an email that already has an account gets a clear message', async ({ page }) => {
        await page.goto('/signup');
        await fillSignup(page, E2E_OWNER.email);
        await expect(page.getByText(t('signup.exists'))).toBeVisible();
    });
});
