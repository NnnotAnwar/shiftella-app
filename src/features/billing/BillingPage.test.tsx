import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
        checkoutUrl: vi.fn(),
        portalUrl: vi.fn(),
    },
}));

import { BillingPage } from './BillingPage';

const base: Subscription = {
    organization_id: 'org1', plan: 'business', status: 'trialing', interval: null, seats: null,
    trial_ends_at: new Date(Date.now() + 20 * 86_400_000).toISOString(), current_period_end: null, cancel_at_period_end: false,
    stripe_customer_id: null, stripe_subscription_id: null, source: 'trial', manual_plan: null, manual_until: null, manual_note: null,
};

function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter>
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

    it('a Superadmin gift hides checkout and says who granted it', async () => {
        row = { ...base, status: 'canceled', manual_plan: 'team', manual_until: null };
        renderPage();
        expect(await screen.findByText('billing.grantedBy:Shiftella')).toBeInTheDocument();
        expect(screen.queryByText(/billing\.choose/)).toBeNull();
        expect(screen.getByText('billing.grantedNoPurchase:Shiftella')).toBeInTheDocument();
    });
});
