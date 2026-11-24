import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { formatDateInText, formatDateShort } from '@shared/utils/date';
import type { User } from '@shared/types';
import type { Subscription } from './entitlements';

const owner: User = {
    id: 'me', username: 'boss', first_name: 'Boss', last_name: null, email: 'b@x.io', organization_id: 'org1',
    role: { name: 'Head Admin', is_admin: true, rank: 40 },
};
const native = { value: false };
let row: Subscription | null = null;
let usage = { members: 23, locations: 2 };

const freeBeta = vi.hoisted(() => ({ on: false }));
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
        url?: string;
        constructor(message: string, extra: { code?: string; limit?: number; count?: number; url?: string } = {}) {
            super(message);
            Object.assign(this, extra);
        }
    }
    return {
        BillingError,
        billingService: {
            getSubscription: vi.fn(async () => row),
            getUsage: vi.fn(async () => usage),
            getFreeBeta: vi.fn(async () => freeBeta.on),
            // Never resolves: the redirect stays "on its way" (jsdom can't navigate).
            checkoutUrl: vi.fn(() => new Promise<string>(() => {})),
            portalUrl: vi.fn(),
            changePlan: vi.fn(async () => ({ unchanged: false })),
            switchToFree: vi.fn(async () => ({ unchanged: false, endsAt: null })),
            resume: vi.fn(async () => ({ unchanged: false })),
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
        freeBeta.on = false;
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

    it('free beta: Business, a "free during beta" note, no trial and nothing to buy', async () => {
        freeBeta.on = true;
        renderPage();
        expect(await screen.findByText('billing.status.beta')).toBeInTheDocument();
        expect(screen.getByText('billing.betaHint')).toBeInTheDocument();
        expect(screen.getByText('billing.betaPlansSoon')).toBeInTheDocument();
        expect(screen.getByText('billing.plan.business')).toBeInTheDocument();
        expect(screen.queryByText(/billing\.trialDaysLeft/)).toBeNull();
        expect(screen.queryByText(/billing\.choose/)).toBeNull();
        expect(screen.queryByText(/Kč/)).toBeNull();
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

    it('PAYMENT_REQUIRED (card declined / 3-D Secure): heads to the invoice, no error, no Checkout', async () => {
        row = live('team', 'month');
        vi.mocked(billingService.changePlan).mockRejectedValue(
            new BillingError('unpaid', { code: 'PAYMENT_REQUIRED', url: 'https://invoice.stripe.com/i/acct_x/inv_1' }),
        );
        const checkouts = vi.mocked(billingService.checkoutUrl).mock.calls.length;
        renderPage();
        const business = await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.business' });
        fireEvent.click(business);
        await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'billing.switchConfirm' })));
        expect(toast).toHaveBeenCalledWith('billing.err.PAYMENT_REQUIRED', 'info');
        expect(toast).not.toHaveBeenCalledWith(expect.anything(), 'error');
        expect(billingService.checkoutUrl).toHaveBeenCalledTimes(checkouts);
        expect(business).toHaveAttribute('aria-busy', 'true');
    });

    it('native: no switch buttons even with a live subscription', async () => {
        native.value = true;
        row = live('business', 'month');
        renderPage();
        expect(await screen.findByText('billing.manageOnWeb:Shiftella')).toBeInTheDocument();
        expect(screen.queryByText(/billing\.switchTo/)).toBeNull();
    });
});

describe('BillingPage — switch to Free, resume, ended', () => {
    const periodEnd = new Date(Date.now() + 12 * 86_400_000).toISOString();
    const live = (over: Partial<Subscription> = {}): Subscription => ({
        ...base,
        plan: 'team',
        interval: 'month',
        status: 'active',
        seats: 1,
        trial_ends_at: null,
        source: 'stripe',
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
        current_period_end: periodEnd,
        ...over,
    });
    const freeButton = () => screen.queryByRole('button', { name: 'billing.switchToFree' });

    beforeEach(() => {
        native.value = false;
        usage = { members: 4, locations: 1 };
        vi.mocked(toast).mockClear();
        vi.mocked(billingService.switchToFree).mockReset().mockResolvedValue({ unchanged: false, endsAt: periodEnd });
        vi.mocked(billingService.resume).mockReset().mockResolvedValue({ unchanged: false });
    });

    it('"Switch to Free" only with a live subscription that is not cancel-scheduled', async () => {
        for (const status of ['active', 'trialing', 'past_due'] as const) {
            row = live({ status });
            const view = renderPage();
            expect(await screen.findByRole('button', { name: 'billing.switchToFree' })).toBeEnabled();
            view.unmount();
        }

        const none: Subscription[] = [
            { ...base }, // our no-card trial
            live({ status: 'canceled' }), // ended
            live({ cancel_at_period_end: true }), // already scheduled
            live({ manual_plan: 'business' }), // gift
            { ...base, status: 'active', source: 'grandfathered', trial_ends_at: null },
        ];
        for (const r of none) {
            row = r;
            const view = renderPage();
            await screen.findByText('billing.currentPlan');
            expect(freeButton()).toBeNull();
            view.unmount();
        }

        native.value = true;
        row = live();
        renderPage();
        await screen.findByText('billing.currentPlan');
        expect(freeButton()).toBeNull();
    });

    it('confirm: cancelled at the period end, works until then, Free limits after — no counts when it fits', async () => {
        row = live();
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchToFree' }));
        expect(screen.getByRole('dialog', { name: 'billing.toFree.title' })).toBeInTheDocument();
        expect(screen.getByText(`billing.toFree.paid:${formatDateInText(periodEnd)}`)).toBeInTheDocument();
        expect(screen.getByText('billing.toFree.after:5,1')).toBeInTheDocument();
    });

    it('confirm during a Stripe trial: ends with the trial, nothing charged', async () => {
        row = live({ status: 'trialing' });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchToFree' }));
        expect(screen.getByText(`billing.toFree.trial:${formatDateInText(periodEnd)}`)).toBeInTheDocument();
    });

    it('confirm over the Free limits lists the current counts (Czech few / many for locations)', async () => {
        row = live({ plan: 'business', seats: 12 });
        usage = { members: 12, locations: 3 };
        const view = renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchToFree' }));
        expect(
            screen.getByText(
                'billing.toFree.after:5,1 billing.toFree.over:billing.toFree.overMembers:12billing.toFree.andbilling.toFree.overLocationsFew:3',
            ),
        ).toBeInTheDocument();
        view.unmount();

        usage = { members: 5, locations: 7 };
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchToFree' }));
        expect(screen.getByText('billing.toFree.after:5,1 billing.toFree.over:billing.toFree.overLocationsMany:7')).toBeInTheDocument();
    });

    it('confirming cancels at period end: toast with the date, refetch, no stuck spinner', async () => {
        row = live();
        renderPage();
        const button = await screen.findByRole('button', { name: 'billing.switchToFree' });
        fireEvent.click(button);
        const fetches = vi.mocked(billingService.getSubscription).mock.calls.length;
        row = live({ cancel_at_period_end: true });
        await act(async () => void fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'billing.switchToFree' })));
        expect(billingService.switchToFree).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith(`billing.toFreeDone:${formatDateInText(periodEnd)}`, 'success');
        expect(vi.mocked(billingService.getSubscription).mock.calls.length).toBeGreaterThan(fetches);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        // Now scheduled: the Free card says from when, the current plan offers Resume.
        expect(await screen.findByText(`billing.fromDate:${formatDateInText(periodEnd)}`)).toBeInTheDocument();
        expect(freeButton()).toBeNull();
        expect(screen.getByRole('button', { name: 'billing.resume' })).toBeEnabled();
    });

    it('a failure shows the error and leaves the button usable', async () => {
        row = live();
        vi.mocked(billingService.switchToFree).mockRejectedValue(new BillingError('Stripe is down'));
        renderPage();
        const button = await screen.findByRole('button', { name: 'billing.switchToFree' });
        fireEvent.click(button);
        await act(async () => void fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'billing.switchToFree' })));
        expect(toast).toHaveBeenCalledWith('Stripe is down', 'error');
        expect(button).not.toHaveAttribute('aria-busy');
        expect(button).toBeEnabled();
    });

    it('cancel scheduled: "Ends {date}" chip, end date line, "From {date}" on Free, Resume', async () => {
        row = live({ cancel_at_period_end: true });
        renderPage();
        expect(await screen.findByText(`billing.status.endsOn:${formatDateShort(periodEnd)}`)).toBeInTheDocument();
        expect(screen.getByText(`billing.endsOn:${formatDateInText(periodEnd)}`)).toBeInTheDocument();
        expect(screen.getByText(`billing.fromDate:${formatDateInText(periodEnd)}`)).toBeInTheDocument();
        expect(freeButton()).toBeNull();
    });

    it('resume: no confirm, toast, refetch, no stuck spinner', async () => {
        row = live({ cancel_at_period_end: true });
        renderPage();
        const button = await screen.findByRole('button', { name: 'billing.resume' });
        const fetches = vi.mocked(billingService.getSubscription).mock.calls.length;
        row = live();
        await act(async () => void fireEvent.click(button));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(billingService.resume).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith('billing.resumed', 'success');
        expect(vi.mocked(billingService.getSubscription).mock.calls.length).toBeGreaterThan(fetches);
        expect(await screen.findByRole('button', { name: 'billing.switchToFree' })).toBeEnabled();
        expect(screen.queryByRole('button', { name: 'billing.resume' })).toBeNull();
    });

    it('a plan switch while a cancel is scheduled says it resumes the subscription', async () => {
        row = live({ cancel_at_period_end: true });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'billing.switchTo:billing.plan.business' }));
        expect(screen.getByText('billing.switchChargeNow billing.switchMinNote:10 billing.switchResumes')).toBeInTheDocument();
    });

    it('native: no Resume, no Free button, even when cancel-scheduled', async () => {
        native.value = true;
        row = live({ cancel_at_period_end: true });
        renderPage();
        expect(await screen.findByText(`billing.endsOn:${formatDateInText(periodEnd)}`)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'billing.resume' })).toBeNull();
        expect(screen.queryByText(/billing\.fromDate/)).toBeNull();
    });

    it('a subscription that ended: "Subscription ended" chip + hint, Checkout buttons again', async () => {
        row = live({ status: 'canceled', current_period_end: new Date(Date.now() - 2 * 86_400_000).toISOString() });
        renderPage();
        expect(await screen.findByText('billing.status.planEnded')).toBeInTheDocument();
        expect(screen.getByText('billing.planEndedHint')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'billing.choose:billing.plan.team' })).toBeEnabled();
        expect(freeButton()).toBeNull();
    });
});
