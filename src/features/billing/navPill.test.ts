import { describe, expect, it } from 'vitest';
import { billingNavPill } from './navPill';
import { buildEntitlements, type Subscription } from './entitlements';

const NOW = Date.parse('2026-12-10T10:00:00Z');
const DAY = 86_400_000;
const t = (k: string, vars?: Record<string, string | number>) => (vars ? `${k}:${Object.values(vars).join(',')}` : k);

const base: Subscription = {
    organization_id: 'org1', plan: 'business', status: 'trialing', interval: null, seats: null,
    trial_ends_at: new Date(NOW + 20 * DAY).toISOString(), current_period_end: null, cancel_at_period_end: false,
    stripe_customer_id: null, stripe_subscription_id: null, source: 'trial', manual_plan: null, manual_until: null, manual_note: null,
};
const stripe = { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', source: 'stripe' as const, trial_ends_at: null };

const pill = (sub: Subscription | null, { native = false, superadmin = false } = {}) =>
    billingNavPill(buildEntitlements({ subscription: sub, superadmin, now: NOW }), { t, native });

describe('billingNavPill', () => {
    it('trial: amber day count, urgent only in the last 3 days', () => {
        expect(pill(base)).toEqual({ text: 'nav.pill.trial:20', tone: 'amber', urgent: false });
        expect(pill({ ...base, trial_ends_at: new Date(NOW + 2.5 * DAY).toISOString() })).toEqual({
            text: 'nav.pill.trial:3',
            tone: 'amber',
            urgent: true,
        });
    });

    it('trial ended or on Free: "Choose plan" in the accent (web)', () => {
        expect(pill({ ...base, trial_ends_at: new Date(NOW - DAY).toISOString() })).toEqual({ text: 'nav.pill.choosePlan', tone: 'accent', urgent: false });
        expect(pill(null)?.text).toBe('nav.pill.choosePlan');
    });

    it('a paid subscription ended: the same "Choose plan" (native: muted "Free")', () => {
        const ended = { ...base, ...stripe, status: 'canceled' as const, plan: 'team' as const };
        expect(pill(ended)).toEqual({ text: 'nav.pill.choosePlan', tone: 'accent', urgent: false });
        expect(pill(ended, { native: true })).toEqual({ text: 'billing.plan.free', tone: 'muted', urgent: false });
    });

    it('native: no call to buy — just a muted "Free"', () => {
        expect(pill(null, { native: true })).toEqual({ text: 'billing.plan.free', tone: 'muted', urgent: false });
    });

    it('past_due: rose "Payment", urgent', () => {
        expect(pill({ ...base, ...stripe, status: 'past_due', plan: 'team' })).toEqual({ text: 'nav.pill.payment', tone: 'rose', urgent: true });
    });

    it('paid, gifted or early supporter: a quiet plan name', () => {
        expect(pill({ ...base, ...stripe, status: 'active' })).toEqual({ text: 'billing.plan.business', tone: 'muted', urgent: false });
        expect(pill({ ...base, status: 'canceled', manual_plan: 'team' })?.tone).toBe('muted');
        expect(pill({ ...base, status: 'active', source: 'grandfathered', trial_ends_at: null })?.text).toBe('billing.plan.business');
    });

    it('a gift wins over a failed payment', () => {
        expect(pill({ ...base, ...stripe, status: 'past_due', manual_plan: 'business' })?.tone).toBe('muted');
    });

    it('nothing while loading or for the Superadmin', () => {
        expect(pill(base, { superadmin: true })).toBeNull();
        const ent = { ...buildEntitlements({ subscription: base, now: NOW }), isLoading: true };
        expect(billingNavPill(ent, { t, native: false })).toBeNull();
    });
});
