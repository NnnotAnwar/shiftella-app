import { test, expect, t, E2E_OWNER, E2E_PASSWORD } from './fixtures';

test.describe('sign in', () => {
    test('a guest at / gets the landing page and can reach the sign-in form', async ({ page }) => {
        await page.goto('/');
        await page.locator('a[href="/login"]').first().click();
        await expect(page.getByRole('heading', { name: t('auth.welcomeBack') })).toBeVisible();
    });

    test('a wrong password shows one generic error and stays on the form', async ({ page }) => {
        await page.goto('/login');
        await page.locator('#login').fill(E2E_OWNER.email);
        await page.locator('#password').fill('not-the-password');
        await page.getByRole('button', { name: t('auth.signIn'), exact: true }).click();
        await expect(page.getByText(t('auth.invalidCredentials'))).toBeVisible();
        await expect(page).toHaveURL(/\/login$/);
    });

    test('email + password signs the owner in; sign-out returns to the sign-in page', async ({ page }) => {
        await page.goto('/login');
        await page.locator('#login').fill(E2E_OWNER.email);
        await page.locator('#password').fill(E2E_PASSWORD);
        await page.getByRole('button', { name: t('auth.signIn'), exact: true }).click();

        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.getByText(/Petra/).filter({ visible: true }).first()).toBeVisible();

        // The session survives a reload.
        await page.reload();
        await expect(page.getByText(/Petra/).filter({ visible: true }).first()).toBeVisible();

        // Desktop: the sidebar's button; phone: inside the bottom bar's "More" menu.
        const logout = page.getByRole('button', { name: t('nav.logout') }).first();
        if (!(await logout.isVisible())) await page.getByRole('button', { name: t('nav.more') }).click();
        await logout.click();
        await expect(page.locator('#login, a[href="/login"]').first()).toBeVisible();
        await page.goto('/overview');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('a username works as the login too (username-login function)', async ({ page }) => {
        await page.goto('/login');
        await page.locator('#login').fill(E2E_OWNER.username);
        await page.locator('#password').fill(E2E_PASSWORD);
        await page.getByRole('button', { name: t('auth.signIn'), exact: true }).click();
        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.getByText(/Petra/).filter({ visible: true }).first()).toBeVisible();
    });
});
