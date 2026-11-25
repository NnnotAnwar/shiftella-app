import { test, expect, t, signIn, fakeCalls } from './fixtures';

test.describe('in-app feedback', () => {
    test('from Settings: pick a type, write, send → "Thanks, sent" and the context rides along', async ({ page }) => {
        await signIn(page);
        await page.goto('/settings');
        await page.getByRole('button', { name: new RegExp(t('feedback.open')) }).first().click();

        const dialog = page.getByRole('dialog', { name: t('feedback.title') });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('radio', { name: t('feedback.kind.bug') }).click();
        await dialog.getByLabel(t('feedback.message')).fill('The PDF export cuts off the last column.');
        await dialog.getByRole('checkbox').check();
        await dialog.getByRole('button', { name: t('feedback.send') }).click();

        await expect(page.getByText(t('feedback.thanks'))).toBeVisible();
        await expect(dialog).toHaveCount(0);

        const [insert] = await fakeCalls(page, 'insert.app_feedback');
        const [row] = insert.args as Record<string, unknown>[];
        expect(row).toMatchObject({ kind: 'bug', message: 'The PDF export cuts off the last column.', may_contact: true, route: '/settings', language: 'en' });
        expect(row.app_version).toMatch(/^\d+\.\d+\.\d+/);
        expect(row).not.toHaveProperty('user_id');
    });

    test('from the command palette, on a phone too', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await signIn(page);
        await page.goto('/schedule');
        await page.getByRole('button', { name: t('cmd.search') }).first().click();
        await page.keyboard.type(t('feedback.open').slice(0, 8));
        await page.getByRole('dialog').getByRole('button', { name: t('feedback.open') }).click();
        await expect(page.getByRole('dialog', { name: t('feedback.title') })).toBeVisible();
    });
});
