import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@shared/types';
import { GettingStarted } from './GettingStarted';

// Counts the checklist reads: profiles, all rota rows, published rota rows.
const counts = { profiles: 1, scheduled: 0, published: 0 };
const demo = { batch: null as string | null };
const calls = { isFilters: [] as string[], rpc: [] as [string, unknown][] };
vi.mock('@shared/api/supabaseClient', () => ({
    supabase: {
        from: (table: string) => {
            let published = false;
            const q = {
                select: () => q,
                eq: (col: string) => {
                    if (col === 'published') published = true;
                    return q;
                },
                is: (col: string, v: unknown) => {
                    calls.isFilters.push(`${table}.${col}=${String(v)}`);
                    return q;
                },
                maybeSingle: () => Promise.resolve({ data: { demo_batch: demo.batch }, error: null }),
                then: (resolve: (r: { count: number; error: null }) => unknown) =>
                    resolve({ count: table === 'profiles' ? counts.profiles : published ? counts.published : counts.scheduled, error: null }),
            };
            return q;
        },
        rpc: (fn: string, args: unknown) => {
            calls.rpc.push([fn, args]);
            if (fn === 'seed_demo_data') demo.batch = 'b1';
            return Promise.resolve({ data: null, error: null });
        },
    },
}));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}:${Object.values(v).join(',')}` : k);
    return { useTranslation: () => t, usePreferences: () => ({ t, language: 'cs' }) };
});
const toasts: { message: string; opts?: { action?: { label: string } } }[] = [];
vi.mock('@shared/toast/toastStore', () => ({
    toast: (message: string, _type: string, opts?: { action?: { label: string } }) => void toasts.push({ message, opts }),
}));

const owner: User = {
    id: 'owner-1',
    username: 'boss',
    first_name: 'Boss',
    last_name: null,
    email: 'b@x.io',
    organization_id: 'org1',
    role: { name: 'Head Admin', is_admin: true, rank: 40 },
};

const local = new Map<string, string>();
const session = new Map<string, string>();

function renderCard(locationCount: number) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter>
                <GettingStarted user={owner} locationCount={locationCount} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('GettingStarted', () => {
    beforeEach(() => {
        // Node's own (empty) localStorage shadows jsdom's — give the card a real one.
        const fakeStorage = (store: Map<string, string>) => ({
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
            clear: () => store.clear(),
        });
        local.clear();
        session.clear();
        vi.stubGlobal('localStorage', fakeStorage(local));
        vi.stubGlobal('sessionStorage', fakeStorage(session));
        Object.assign(counts, { profiles: 1, scheduled: 0, published: 0 });
        demo.batch = null;
        calls.isFilters.length = 0;
        calls.rpc.length = 0;
        toasts.length = 0;
    });

    it('a brand-new org: four steps, the first is next and has its hint', async () => {
        renderCard(0);
        expect(await screen.findByText('start.title')).toBeInTheDocument();
        expect(screen.getByText('start.sub:0,4')).toBeInTheDocument();
        const links = screen.getAllByRole('link').filter((l) => l.getAttribute('href') !== '/demo/');
        expect(links).toHaveLength(4);
        expect(links[0]).toHaveAttribute('aria-current', 'step');
        expect(links[0]).toHaveAttribute('href', '/admin?tab=locations');
        expect(screen.getByText('start.locationHint')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });

    it('drafted but not published: Publish is the next step', async () => {
        Object.assign(counts, { profiles: 3, scheduled: 12, published: 0 });
        renderCard(1);
        expect(await screen.findByText('start.sub:3,4')).toBeInTheDocument();
        const next = screen.getAllByRole('link').find((a) => a.getAttribute('aria-current') === 'step');
        expect(next).toHaveTextContent('start.publish');
        expect(screen.getByText('start.publishHint')).toBeInTheDocument();
        expect(screen.queryByText('start.planHint')).toBeNull(); // done steps drop their hint
    });

    it('× hides it for this session only', async () => {
        const first = renderCard(0);
        fireEvent.click(await screen.findByRole('button', { name: 'start.hide' }));
        expect(screen.queryByText('start.title')).toBeNull();
        expect(session.get('getting-started:hidden:owner-1')).toBe('1');
        expect(local.has('getting-started:hidden:owner-1')).toBe(false);
        first.unmount();
        session.clear(); // a new session — it is back
        renderCard(0);
        expect(await screen.findByText('start.title')).toBeInTheDocument();
    });

    it('"Don\'t show again" + × hides it for good', async () => {
        renderCard(0);
        fireEvent.click(await screen.findByRole('checkbox', { name: 'start.dontShowAgain' }));
        fireEvent.click(screen.getByRole('button', { name: 'start.hide' }));
        expect(local.get('getting-started:hidden:owner-1')).toBe('1');
    });

    it('everything done: the card is gone', async () => {
        Object.assign(counts, { profiles: 3, scheduled: 12, published: 12 });
        const { container } = renderCard(1);
        await new Promise((r) => setTimeout(r, 20));
        expect(container).toBeEmptyDOMElement();
    });

    it('demo rows never tick a step off: both counts filter demo_batch IS NULL', async () => {
        renderCard(0);
        await screen.findByText('start.title');
        expect(calls.isFilters).toEqual(expect.arrayContaining(['profiles.demo_batch=null', 'scheduled_shifts.demo_batch=null']));
    });

    it('the demo opens in a new tab and never touches the org', async () => {
        renderCard(0);
        const link = await screen.findByRole('link', { name: 'demo.try' });
        expect(link).toHaveAttribute('href', '/demo/');
        expect(link).toHaveAttribute('target', '_blank');
        expect(calls.rpc).toEqual([]);
    });
});
