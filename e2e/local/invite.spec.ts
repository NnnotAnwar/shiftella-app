import { test, expect, t, fakeCalls, outbox, signIn } from './fixtures';

test('owner invites an employee, who opens the email link, sets a password and lands in the app', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin');

    await page.getByRole('button', { name: t('admin.inviteEmployee') }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(t('profile.field.email')).fill('Nova.Kolegyne@umostu.example');
    await dialog.getByLabel(t('profile.field.firstName')).fill('Nová');
    await dialog.getByLabel(t('profile.field.lastName')).fill('Kolegyně');
    await dialog.getByRole('button', { name: t('admin.sendInvite') }).click();
    await expect(dialog).toBeHidden();

    const [call] = await fakeCalls(page, 'functions.invite-employee');
    expect(call.args).toMatchObject({
        email: 'nova.kolegyne@umostu.example', // trimmed + lower-cased
        first_name: 'Nová',
        last_name: 'Kolegyně',
        role: 'Employee',
        redirect_to: expect.stringMatching(/\/accept-invite$/),
    });
    const [mail] = await outbox(page);
    expect(mail.to).toBe('nova.kolegyne@umostu.example');

    // The invitee clicks the link from the email (same browser: their session replaces the owner's).
    await page.goto(mail.link);
    await expect(page.getByText('nova.kolegyne@umostu.example')).toBeVisible();
    await expect(page.getByText('Kavárna U Mostu').first()).toBeVisible();
    await expect(page).toHaveURL(/\/accept-invite$/); // the one-time token is dropped from the URL

    await page.locator('#username').fill('nova.kolegyne');
    await page.getByPlaceholder(t('auth.password'), { exact: true }).fill('heslo-kolegyne-1');
    await page.getByPlaceholder(t('auth.confirmPassword')).fill('heslo-kolegyne-1');
    await page.getByRole('button', { name: t('invite.join', { org: 'Kavárna U Mostu' }) }).click();

    // Full reload into the app, signed in as the new employee.
    await expect(page.getByRole('heading', { level: 1, name: /Nová/ })).toBeVisible();
    // An employee has no admin area.
    await expect(page.getByRole('link', { name: t('nav.admin') })).toHaveCount(0);
});

test('an invalid or used invite link says so', async ({ page }) => {
    await page.goto('/accept-invite?token_hash=bogus&type=invite');
    await expect(page.getByText(t('invite.unavailable'))).toBeVisible({ timeout: 15_000 });
});
