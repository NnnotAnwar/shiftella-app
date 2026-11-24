import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TelegramLink } from './telegramService';

const state = {
    native: false,
    canPush: true,
    link: null as TelegramLink | null,
};

const svc = vi.hoisted(() => ({
    getLink: vi.fn(),
    createLinkCode: vi.fn(),
    updatePrefs: vi.fn(),
    unlink: vi.fn(),
}));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => state.native } }));
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1', organization_id: 'o1', role: { rank: 0 } } }) }));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: string) => k;
    return { useTranslation: () => t, usePreferences: () => ({ t, language: 'en' }) };
});
vi.mock('@shared/toast/toastStore', () => ({ toast: toastMock }));
vi.mock('@features/billing/useBilling', () => ({
    useEntitlements: () => ({ isLoading: false, can: () => state.canPush }),
}));
vi.mock('@features/billing/UpgradeGate', () => ({ UpgradePrompt: () => <div>upgrade-prompt</div> }));
vi.mock('./telegramService', async (orig) => ({
    ...(await orig<typeof import('./telegramService')>()),
    telegramService: svc,
}));

import { TelegramSettings } from './TelegramSettings';

const CODE = 'a'.repeat(40);
const linked: TelegramLink = {
    username: 'jana_k',
    linked_at: '2026-11-24T10:00:00Z',
    muted: false,
    shifts: true,
    account: true,
    requests: true,
    announcements: true,
};

function renderBlock(isReviewer = false) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <TelegramSettings isReviewer={isReviewer} />
        </QueryClientProvider>,
    );
}

describe('Settings → Telegram', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_TELEGRAM_BOT_USERNAME', 'ShiftellaBot');
        state.native = false;
        state.canPush = true;
        state.link = null;
        svc.getLink.mockImplementation(async () => state.link);
        svc.createLinkCode.mockResolvedValue(CODE);
        svc.updatePrefs.mockResolvedValue(undefined);
        svc.unlink.mockResolvedValue(undefined);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('is hidden until the bot username is configured', () => {
        vi.stubEnv('VITE_TELEGRAM_BOT_USERNAME', '');
        const { container } = renderBlock();
        expect(container).toBeEmptyDOMElement();
    });

    it('not linked: Connect opens t.me/<bot>?start=<code> in a new tab, then waits (no stuck spinner)', async () => {
        const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
        const open = vi.fn(() => tab);
        vi.stubGlobal('open', open);
        renderBlock();

        const connect = await screen.findByRole('button', { name: 'settings.telegram.connect' });
        await act(async () => {
            fireEvent.click(connect);
        });
        expect(open).toHaveBeenCalledWith('', '_blank');
        expect(svc.createLinkCode).toHaveBeenCalledTimes(1);
        expect(tab.location.href).toBe(`https://t.me/ShiftellaBot?start=${CODE}`);
        expect(tab.opener).toBeNull();
        expect(await screen.findByText('settings.telegram.waiting')).toBeInTheDocument();
        // Cancel ends the wait; the Connect button is back and not loading.
        fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
        expect(screen.getByRole('button', { name: 'settings.telegram.connect' })).toBeEnabled();
    });

    it('polls after Connect and flips to the linked view once the bot has linked the chat', async () => {
        vi.stubGlobal('open', vi.fn(() => ({ opener: null, location: { href: '' }, close: vi.fn() })));
        renderBlock();
        await act(async () => {
            fireEvent.click(await screen.findByRole('button', { name: 'settings.telegram.connect' }));
        });
        expect(await screen.findByText('settings.telegram.waiting')).toBeInTheDocument();
        state.link = { ...linked }; // the user tapped Start in Telegram
        expect(await screen.findByText('@jana_k', {}, { timeout: 4000 })).toBeInTheDocument();
        expect(toastMock).toHaveBeenCalledWith('settings.telegram.connected', 'success');
    });

    it('closes the pre-opened tab and toasts when the code cannot be created', async () => {
        const tab = { opener: null, location: { href: '' }, close: vi.fn() };
        vi.stubGlobal('open', vi.fn(() => tab));
        svc.createLinkCode.mockRejectedValueOnce(new Error('boom'));
        renderBlock();
        await act(async () => {
            fireEvent.click(await screen.findByRole('button', { name: 'settings.telegram.connect' }));
        });
        expect(tab.close).toHaveBeenCalled();
        expect(toastMock).toHaveBeenCalledWith('settings.telegram.error', 'error');
        expect(screen.getByRole('button', { name: 'settings.telegram.connect' })).toBeEnabled();
    });

    it('native: navigates (Capacitor hands t.me to the OS) instead of window.open', async () => {
        state.native = true;
        const open = vi.fn();
        const assign = vi.fn();
        vi.stubGlobal('open', open);
        vi.stubGlobal('location', { ...window.location, assign });
        renderBlock();
        await act(async () => {
            fireEvent.click(await screen.findByRole('button', { name: 'settings.telegram.connect' }));
        });
        expect(open).not.toHaveBeenCalled();
        expect(assign).toHaveBeenCalledWith(`https://t.me/ShiftellaBot?start=${CODE}`);
    });

    it('linked: shows @username · linked, switches update the link, Disconnect unlinks', async () => {
        state.link = { ...linked };
        renderBlock(true);
        expect(await screen.findByText('@jana_k')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'settings.telegram.openBot' })).toHaveAttribute('href', 'https://t.me/ShiftellaBot');
        expect(screen.getByText(/· settings\.telegram\.linked$/)).toBeInTheDocument();
        // Reviewer sees the requests switch.
        expect(screen.getByRole('switch', { name: 'settings.notif.requests' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('switch', { name: 'settings.notif.shifts' }));
        await waitFor(() => expect(svc.updatePrefs).toHaveBeenCalledWith('u1', { shifts: false }));
        expect(screen.getByRole('switch', { name: 'settings.notif.shifts' })).toHaveAttribute('aria-checked', 'false');

        // Muting disables the category switches.
        fireEvent.click(screen.getByRole('switch', { name: 'settings.telegram.messages' }));
        await waitFor(() => expect(svc.updatePrefs).toHaveBeenCalledWith('u1', { muted: true }));
        expect(screen.getByRole('switch', { name: 'settings.telegram.announcements' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'settings.telegram.disconnect' }));
        await waitFor(() => expect(svc.unlink).toHaveBeenCalledWith('u1'));
        expect(await screen.findByRole('button', { name: 'settings.telegram.connect' })).toBeInTheDocument();
        expect(toastMock).toHaveBeenCalledWith('settings.telegram.disconnected', 'success');
    });

    it('non-reviewers get no requests switch', async () => {
        state.link = { ...linked };
        renderBlock(false);
        await screen.findByText('@jana_k');
        expect(screen.queryByRole('switch', { name: 'settings.notif.requests' })).toBeNull();
    });

    it('Free plan: upgrade prompt instead of Connect; an existing link can still be removed', async () => {
        state.canPush = false;
        const view = renderBlock();
        expect(await screen.findByText('upgrade-prompt')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'settings.telegram.connect' })).toBeNull();
        view.unmount();

        state.link = { ...linked };
        renderBlock();
        expect(await screen.findByRole('button', { name: 'settings.telegram.disconnect' })).toBeInTheDocument();
    });
});
