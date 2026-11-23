import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@shared/types';
import type { Subscription } from './entitlements';

const owner: User = {
    id: 'me', username: 'boss', first_name: 'Boss', last_name: null, email: 'b@x.io', organization_id: 'org1',
    role: { name: 'Head Admin', is_admin: true, rank: 40 },
};
const native = { value: false };
let row: Subscription | null = null;

vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: owner }) }));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: string, vars?: Record<string, string | number>) => (vars ? `${k}:${Object.values(vars).join(',')}` : k);
    return { useTranslation: () => t, usePreferences: () => ({ t, language: 'en' }) };
});
vi.mock('@shared/toast/toastStore', () => ({ toast: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value, getPlatform: () => 'web' } }));
vi.mock('./billingService', () => ({
    billingService: {
        getSubscription: vi.fn(async () => row),
        getUsage: vi.fn(async () => ({ members: 23, locations: 2 })),
        // Never resolves: the redirect stays "on its way" (jsdom can't navigate).
        checkoutUrl: vi.fn(() => new Promise<string>(() => {})),
        portalUrl: vi.fn(),
    },
}));

import { BillingPage } from './BillingPage';
import { billingService } from './billingService';

const base: Subscription = {
    organization_id: 'org1', plan: 'business', status: 'trialing', interval: null, seats: null,
    trial_ends_at: new Date(Date.now() + 20 * 86_400_000).toISOString(), current_period_end: null, cancel_at_period_end: false,
    stripe_customer_id: null, stripe_subscription_id: null, source: 'trial', manual_plan: null, manual_until: null, manual_note: null,
};

function renderPage(path = '/billing') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[path]}>
                <BillingPage />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('BillingPage', () => {
    beforeEach(() => {
        native.value = false;
        row = { ...base };
    });

    it('web: shows the trial, plan cards with prices and the Business estimate', async () => {
        renderPage();
        expect(await screen.findByText('billing.trialDaysLeft:20')).toBeInTheDocument();
        expect(screen.getByText('billing.choose:billing.plan.team')).toBeInTheDocument();
        expect(screen.getByText('billing.choose:billing.plan.business')).toBeInTheDocument();
        expect(screen.getByText('449 Kč')).toBeInTheDocument();
        expect(screen.getByText(/billing\.estimate:23,1,035 Kč/)).toBeInTheDocument();
    });

    it('native: plan status only — no prices, no purchase buttons', async () => {
        native.value = true;
        renderPage();
        expect(await screen.findByText('billing.trialDaysLeft:20')).toBeInTheDocument();
        expect(screen.queryByText(/billing\.choose/)).toBeNull();
        expect(screen.queryByText(/Kč/)).toBeNull();
        expect(screen.getByText('billing.manageOnWeb:Shiftella')).toBeInTheDocument();
    });

    it('back from a canceled Checkout: everything idle and usable', async () => {
        renderPage('/billing?checkout=canceled');
        const team = await screen.findByRole('button', { name: 'billing.choose:billing.plan.team' });
        const business = screen.getByRole('button', { name: 'billing.choose:billing.plan.business' });
        expect(team).toBeEnabled();
        expect(business).toBeEnabled();
        expect(screen.queryByText('billing.activating')).toBeNull();
    });

    it('back from a successful Checkout: a calm "activating" line, plan buttons stay enabled', async () => {
        renderPage('/billing?checkout=success');
        expect(await screen.findByText('billing.activating')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'billing.choose:billing.plan.team' })).toBeEnabled();
    });

    it('Browser Back to a bfcached page clears the spinner and refetches the plan', async () => {
        renderPage();
        const team = await screen.findByRole('button', { name: 'billing.choose:billing.plan.team' });
        const business = screen.getByRole('button', { name: 'billing.choose:billing.plan.business' });
        fireEvent.click(team);
        expect(team).toHaveAttribute('aria-busy', 'true');
        expect(business).toBeDisabled();

        const fetches = vi.mocked(billingService.getSubscription).mock.calls.length;
        await act(async () => void window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })));
        expect(team).not.toHaveAttribute('aria-busy');
        expect(team).toBeEnabled();
        expect(business).toBeEnabled();
        expect(vi.mocked(billingService.getSubscription).mock.calls.length).toBeGreaterThan(fetches);
    });

    it('a Superadmin gift hides checkout and says who granted it', async () => {
        row = { ...base, status: 'canceled', manual_plan: 'team', manual_until: null };
        renderPage();
        expect(await screen.findByText('billing.grantedBy:Shiftella')).toBeInTheDocument();
        expect(screen.queryByText(/billing\.choose/)).toBeNull();
        expect(screen.getByText('billing.grantedNoPurchase:Shiftella')).toBeInTheDocument();
    });
});
