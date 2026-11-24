import { test, expect, t, signIn } from './fixtures';

test.describe('billing during the free beta', () => {
    test('the owner sees "Free beta", everything included, and no plans to buy', async ({ page }) => {
        await signIn(page);
        await page.goto('/billing');
        await expect(page.getByText(t('billing.status.beta')).first()).toBeVisible();
        await expect(page.getByText(t('billing.betaHint'))).toBeVisible();
        await expect(page.getByText(t('billing.betaPlansSoon'))).toBeVisible();
        await expect(page.getByRole('heading', { name: t('billing.plans') })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Choose/ })).toHaveCount(0);
    });
});

test.describe('billing without the beta', () => {
    test.use({ billing: 'free' });

    test('after the trial the owner sees the plans to choose from', async ({ page }) => {
        await signIn(page);
        await page.goto('/billing');
        await expect(page.getByRole('heading', { name: t('billing.plans') })).toBeVisible();
        await expect(page.getByText(t('billing.betaHint'))).toHaveCount(0);
    });
});
