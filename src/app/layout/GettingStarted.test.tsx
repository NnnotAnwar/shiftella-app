import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@shared/types';
import { GettingStarted } from './GettingStarted';

// Counts the checklist reads: profiles, all rota rows, published rota rows.
const counts = { profiles: 1, scheduled: 0, published: 0 };
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
                then: (resolve: (r: { count: number; error: null }) => unknown) =>
                    resolve({ count: table === 'profiles' ? counts.profiles : published ? counts.published : counts.scheduled, error: null }),
            };
            return q;
        },
    },
}));
vi.mock('@shared/preferences/PreferencesContext', () => ({
    useTranslation: () => (k: string, v?: Record<string, string | number>) => (v ? `${k}:${Object.values(v).join(',')}` : k),
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
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
            clear: () => store.clear(),
        });
        Object.assign(counts, { profiles: 1, scheduled: 0, published: 0 });
    });

    it('a brand-new org: four steps, the first is next and has its hint', async () => {
        renderCard(0);
        expect(await screen.findByText('start.title')).toBeInTheDocument();
        expect(screen.getByText('start.sub:0,4')).toBeInTheDocument();
        const links = screen.getAllByRole('link');
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

    it('everything done: the card is gone', async () => {
        Object.assign(counts, { profiles: 3, scheduled: 12, published: 12 });
        const { container } = renderCard(1);
        await new Promise((r) => setTimeout(r, 20));
        expect(container).toBeEmptyDOMElement();
    });
});
