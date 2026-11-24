import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@shared/types';

const demo = { batch: 'b1' as string | null };
const rpc = vi.fn((fn: string) => {
    if (fn === 'clear_demo_data') demo.batch = null;
    return Promise.resolve({ data: null, error: null });
});
vi.mock('@shared/api/supabaseClient', () => ({
    supabase: {
        from: () => {
            const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: { demo_batch: demo.batch }, error: null }) };
            return q;
        },
        rpc: (fn: string, args?: unknown) => rpc(fn, args),
    },
}));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: string) => k;
    return { useTranslation: () => t, usePreferences: () => ({ t, language: 'en' }) };
});
type ToastOpts = { action?: { label: string; onClick: () => void }; onExpire?: () => void };
const toasts: { message: string; opts?: ToastOpts }[] = [];
vi.mock('@shared/toast/toastStore', () => ({
    toast: (message: string, _type: string, opts?: ToastOpts) => void toasts.push({ message, opts }),
}));

import { DemoDataBanner } from './DemoDataBanner';
import { canManageDemo } from './useDemoData';
import { demoLang } from './demoService';

const owner: User = {
    id: 'me', username: 'boss', first_name: 'Boss', last_name: null, email: 'b@x.io', organization_id: 'org1',
    role: { name: 'Head Admin', is_admin: true, rank: 40 },
};
const admin: User = { ...owner, id: 'adm', role: { name: 'Admin', is_admin: true, rank: 30 } };

function renderBanner(user: User = owner) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <DemoDataBanner user={user} />
        </QueryClientProvider>,
    );
}

describe('DemoDataBanner', () => {
    beforeEach(() => {
        demo.batch = 'b1';
        rpc.mockClear();
        toasts.length = 0;
    });

    it('shows while the org holds demo data', async () => {
        renderBanner();
        expect(await screen.findByText('demo.banner')).toBeInTheDocument();
    });

    it('nothing without demo data', async () => {
        demo.batch = null;
        const { container } = renderBanner();
        await new Promise((r) => setTimeout(r, 20));
        expect(container).toBeEmptyDOMElement();
    });

    it('only the owner sees it', async () => {
        const { container } = renderBanner(admin);
        await new Promise((r) => setTimeout(r, 20));
        expect(container).toBeEmptyDOMElement();
    });

    it('remove: hides at once, deletes only when the Undo window ends', async () => {
        renderBanner();
        fireEvent.click(await screen.findByRole('button', { name: 'demo.clear' }));
        await waitFor(() => expect(screen.queryByText('demo.banner')).toBeNull());
        const t = toasts.find((x) => x.message === 'demo.cleared');
        expect(t?.opts?.action?.label).toBe('common.undo');
        expect(rpc).not.toHaveBeenCalled();
        await act(async () => t?.opts?.onExpire?.());
        await waitFor(() => expect(rpc).toHaveBeenCalledWith('clear_demo_data', undefined));
    });

    it('Undo keeps everything', async () => {
        renderBanner();
        fireEvent.click(await screen.findByRole('button', { name: 'demo.clear' }));
        await waitFor(() => expect(screen.queryByText('demo.banner')).toBeNull());
        act(() => toasts.find((x) => x.message === 'demo.cleared')?.opts?.action?.onClick());
        expect(await screen.findByText('demo.banner')).toBeInTheDocument();
        expect(rpc).not.toHaveBeenCalled();
    });
});

describe('demo helpers', () => {
    it('owner only, never Superadmin', () => {
        expect(canManageDemo(owner)).toBe(true);
        expect(canManageDemo(admin)).toBe(false);
        expect(canManageDemo({ ...owner, role: { name: 'Superadmin', is_admin: true, rank: 100 } })).toBe(false);
        expect(canManageDemo(null)).toBe(false);
    });

    it('Czech texts for cs / sk, English otherwise', () => {
        expect(demoLang('cs')).toBe('cs');
        expect(demoLang('sk')).toBe('cs');
        expect(demoLang('en')).toBe('en');
        expect(demoLang('uk')).toBe('en');
    });
});
