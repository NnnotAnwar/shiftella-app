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
let usage = { members: 23, locations: 2 };

vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: owner }) }));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: string, vars?: Record<string, string | number>) => (vars ? `${k}:${Object.values(vars).join(',')}` : k);
    return { useTranslation: () => t, usePreferences: () => ({ t, language: 'en' }) };
});
vi.mock('@shared/toast/toastStore', () => ({ toast: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value, getPlatform: () => 'web' } }));
vi.mock('./billingService', () => {
    class BillingError extends Error {
        code?: string;
        limit?: number;
        count?: number;
        constructor(message: string, extra: { code?: string; limit?: number; count?: number } = {}) {
            super(message);
            Object.assign(this, extra);
        }
    }
    return {
        BillingError,
        billingService: {
            getSubscription: vi.fn(async () => row),
            getUsage: vi.fn(async () => usage),
            // Never resolves: the redirect stays "on its way" (jsdom can't navigate).
            checkoutUrl: vi.fn(() => new Promise<string>(() => {})),
            portalUrl: vi.fn(),
            changePlan: vi.fn(async () => ({ unchanged: false })),
        },
    };
});

import { BillingPage } from './BillingPage';
import { BillingError, billingService } from './billingService';
import { toast } from '@shared/toast/toastStore';

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
        usage = { members: 23, locations: 2 };
        vi.mocked(toast).mockClear();
        vi.mocked(billingService.changePlan).mockReset().mockResolvedValue({ unchanged: false });
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

describe('BillingPage — switching a live subscription in place', () => {
    const live = (plan: 'team' | 'business', interval: 'month' | 'year', status: Subscription['status'] = 'active'): Subscription => ({
        ...base,
        plan,
        interval,
        status,
        seats: plan === 'team' ? 1 : 23,
        source: 'stripe',
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
        current_period_end: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    });

    beforeEach(() => {
        native.value = false;
        usage = { members: 23, locations: 2 };
        vi.mocked(toast).mockClear();
        vi.mocked(billingService.changePlan).mockReset().mockResolvedValue({ unchanged: false });
    });

    it('no live subscription (no-card trial): Checkout buttons, no switch buttons', async () => {
        row = { ...base };
        renderPage();
        expect(await screen.findByText('billing.choose:billing.plan.team')).toBeInTheDocument();
        expect(screen.queryByText(/billing\.switchTo/)).toBeNull();
    });

    it('live Business monthly: "Switch to Team" on the other card, nothing on the current one, no Checkout', async () => {
        row = live('business', 'month');
        renderPage();
        expect(await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.team' })).toBeEnabled();
        expect(screen.queryByText('billing.switchTo:billing.plan.business')).toBeNull();
        expect(screen.queryByText(/billing\.choose/)).toBeNull();
        expect(screen.queryByText(/billing\.switchToYearly|billing\.switchToMonthly/)).toBeNull();
    });

    it('Team confirm: flat price (quantity 1), credited as a downgrade', async () => {
        row = live('business', 'month');
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.team' }));
        expect(screen.getByText('billing.switchTitle:billing.plan.team,billing.monthly')).toBeInTheDocument();
        expect(screen.getByText('billing.switchPriceFlat:449 Kč,billing.perMonthShort')).toBeInTheDocument();
        expect(screen.getByText('billing.switchCredit')).toBeInTheDocument();
    });

    it('Business confirm: billed for at least 10 people, charged now as an upgrade', async () => {
        row = live('team', 'month');
        usage = { members: 3, locations: 1 };
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.business' }));
        expect(screen.getByText('billing.switchPricePerMember:10,45 Kč,450 Kč,billing.perMonthShort')).toBeInTheDocument();
        expect(screen.getByText('billing.switchChargeNow billing.switchMinNote:10')).toBeInTheDocument();
    });

    it('Business yearly confirm with more than 10 people: N × 432 Kč', async () => {
        row = live('team', 'year');
        usage = { members: 12, locations: 1 };
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.business' }));
        expect(screen.getByText('billing.switchPricePerMember:12,432 Kč,5,184 Kč,billing.perYearShort')).toBeInTheDocument();
        expect(screen.getByText('billing.switchChargeNow')).toBeInTheDocument();
    });

    it('during a Stripe trial nothing is charged', async () => {
        row = live('business', 'month', 'trialing');
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.team' }));
        expect(screen.getByText('billing.switchTrial')).toBeInTheDocument();
    });

    it('interval switch on the current plan: confirm, change, toast, refetch', async () => {
        row = live('team', 'month');
        renderPage();
        await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.business' });
        fireEvent.click(screen.getByRole('button', { name: /billing\.yearly/ }));
        fireEvent.click(screen.getByRole('button', { name: 'billing.switchToYearly' }));
        expect(screen.getByText('billing.switchPriceFlat:4,308 Kč,billing.perYearShort')).toBeInTheDocument();
        expect(screen.getByText('billing.switchChargeNow')).toBeInTheDocument();

        const fetches = vi.mocked(billingService.getSubscription).mock.calls.length;
        await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'billing.switchConfirm' })));
        expect(billingService.changePlan).toHaveBeenCalledWith('team', 'year');
        expect(toast).toHaveBeenCalledWith('billing.planChanged:billing.plan.team,billing.yearly', 'success');
        expect(vi.mocked(billingService.getSubscription).mock.calls.length).toBeGreaterThan(fetches);
        expect(screen.queryByText('billing.switchConfirm')).toBeNull();
        expect(screen.getByRole('button', { name: 'billing.switchToYearly' })).not.toHaveAttribute('aria-busy');
    });

    it('a Team that would not fit: the limit message, no stuck spinner', async () => {
        row = live('business', 'month');
        vi.mocked(billingService.changePlan).mockRejectedValue(
            new BillingError('Team allows up to 15 people', { code: 'PLAN_LIMIT_MEMBERS', limit: 15, count: 23 }),
        );
        renderPage();
        const team = await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.team' });
        fireEvent.click(team);
        await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'billing.switchConfirm' })));
        expect(toast).toHaveBeenCalledWith('billing.switchLimit.members:15,23', 'error');
        expect(team).not.toHaveAttribute('aria-busy');
        expect(team).toBeEnabled();
    });

    it('locations over the Team limit and other errors show their message', async () => {
        row = live('business', 'month');
        vi.mocked(billingService.changePlan)
            .mockRejectedValueOnce(new BillingError('too many locations', { code: 'PLAN_LIMIT_LOCATIONS', limit: 3, count: 5 }))
            .mockRejectedValueOnce(new BillingError('Stripe is down'));
        renderPage();
        const team = await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.team' });
        fireEvent.click(team);
        await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'billing.switchConfirm' })));
        expect(toast).toHaveBeenCalledWith('billing.switchLimit.locations:3,5', 'error');
        fireEvent.click(team);
        await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'billing.switchConfirm' })));
        expect(toast).toHaveBeenCalledWith('Stripe is down', 'error');
    });

    it('NO_SUBSCRIPTION (it ended meanwhile): falls back to Checkout for the same choice', async () => {
        row = live('business', 'month');
        vi.mocked(billingService.changePlan).mockRejectedValue(new BillingError('none', { code: 'NO_SUBSCRIPTION' }));
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.team' }));
        await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'billing.switchConfirm' })));
        expect(billingService.checkoutUrl).toHaveBeenCalledWith('team', 'month', 'en');
        expect(toast).not.toHaveBeenCalledWith(expect.anything(), 'error');
    });

    it('native: no switch buttons even with a live subscription', async () => {
        native.value = true;
        row = live('business', 'month');
        renderPage();
        expect(await screen.findByText('billing.manageOnWeb:Shiftella')).toBeInTheDocument();
        expect(screen.queryByText(/billing\.switchTo/)).toBeNull();
    });
});
