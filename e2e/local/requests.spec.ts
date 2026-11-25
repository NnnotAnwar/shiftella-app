import { test, expect, t, signIn, fakeCalls } from './fixtures';

// The public demo runs on this same fake backend: approving must really change things
// (it once "succeeded" silently and nothing happened).
test.describe('requests inbox (owner)', () => {
    test('approving a shift swap and a name change takes effect', async ({ page }) => {
        await signIn(page);
        await page.goto('/requests');

        const swap = page.getByRole('listitem').filter({ hasText: t('swap.typeLabel') }).filter({ hasText: 'Eva Dvořáková' });
        await swap.getByRole('button', { name: t('requests.approve'), exact: true }).click();
        await expect(swap).toHaveCount(0);

        const rename = page.getByRole('listitem').filter({ hasText: t('requests.typeName') });
        await rename.getByRole('button', { name: t('requests.approve'), exact: true }).click();
        await expect(rename).toHaveCount(0);

        expect(await fakeCalls(page, 'rpc.review_shift_swap')).toHaveLength(1);
        expect(await fakeCalls(page, 'rpc.review_name_change_request')).toHaveLength(1);

        // History shows both as decided, and the new surname is used everywhere.
        await page.getByRole('tab', { name: t('requests.history') }).or(page.getByRole('button', { name: t('requests.history') })).first().click();
        await expect(page.getByRole('listitem').filter({ hasText: t('requests.typeName') }).getByText('Veronika Šťastná').first()).toBeVisible();
        await page.goto('/admin');
        await expect(page.getByText('Veronika Šťastná').first()).toBeVisible();
        await expect(page.getByText('Veronika Pokorná')).toHaveCount(0);
    });
});
