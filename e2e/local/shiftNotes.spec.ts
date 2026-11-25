import { test, expect, t, signIn, fakeCalls } from './fixtures';

const TODAYS_NOTE = 'Pokladna sedí, tržba z rána odvezená do banky.';

test.describe('shift notes (manager list)', () => {
    test('the owner reads today’s notes, filters by location and removes one with Undo', async ({ page }) => {
        await signIn(page);
        await page.goto('/notes');
        await expect(page.getByRole('heading', { name: t('notes.pageTitle') })).toBeVisible();
        await expect(page.getByText(TODAYS_NOTE)).toBeVisible();

        // Another location: the Malá Strana note goes away.
        await page.getByRole('button', { name: t('notes.location'), exact: true }).click();
        await page.getByRole('option', { name: 'Karlín' }).click();
        await expect(page.getByText(TODAYS_NOTE)).toHaveCount(0);
        await page.getByRole('button', { name: t('notes.location'), exact: true }).click();
        await page.getByRole('option', { name: t('announcements.allLocations') }).click();
        await expect(page.getByText(TODAYS_NOTE)).toBeVisible();

        // One tap removes it; Undo brings it back and nothing is deleted.
        const row = page.getByRole('listitem').filter({ hasText: TODAYS_NOTE });
        await row.getByRole('button', { name: t('common.delete') }).click();
        await expect(page.getByText(TODAYS_NOTE)).toHaveCount(0);
        await page.getByRole('button', { name: t('common.undo') }).click();
        await expect(page.getByText(TODAYS_NOTE)).toBeVisible();
        expect(await fakeCalls(page, 'delete.shift_notes')).toHaveLength(0);
    });
});
