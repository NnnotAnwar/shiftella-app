import { describe, expect, it } from 'vitest';
import { buildEntitlements, effectivePlan, effectiveSource, fitsLimit, hasActiveGrant, isTrialActive, subscriptionEnded, trialDaysLeft, trialExpired, type Subscription } from './entitlements';
import { BUSINESS_MIN_SEATS, LIMITS, TRIAL_DAYS, billedQuantity, monthlyEstimateCzk, requiredPlan, yearlySavingPct } from './plans';

const NOW = new Date('2026-11-22T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const at = (ms: number) => new Date(ms).toISOString();

const sub = (over: Partial<Subscription> = {}): Subscription => ({
    organization_id: 'org1',
    plan: 'business',
    status: 'trialing',
    interval: null,
    seats: null,
    trial_ends_at: at(NOW + TRIAL_DAYS * DAY),
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    source: 'trial',
    manual_plan: null,
    manual_until: null,
    manual_note: null,
    ...over,
});

describe('effective plan', () => {
    it('no row is Free', () => {
        expect(effectivePlan(null, NOW)).toBe('free');
        expect(effectivePlan(undefined, NOW)).toBe('free');
    });

    it('a new organization gets a 30-day Business trial', () => {
        expect(TRIAL_DAYS).toBe(30);
        const s = sub();
        expect(effectivePlan(s, NOW)).toBe('business');
        expect(isTrialActive(s, NOW)).toBe(true);
        expect(trialDaysLeft(s, NOW)).toBe(30);
    });

    it('rounds the days left up and falls back to Free when the no-card trial ends', () => {
        const s = sub({ trial_ends_at: at(NOW + 2 * 60 * 60 * 1000) });
        expect(trialDaysLeft(s, NOW)).toBe(1);
        const ended = sub({ trial_ends_at: at(NOW - 1000) });
        expect(effectivePlan(ended, NOW)).toBe('free');
        expect(isTrialActive(ended, NOW)).toBe(false);
        expect(trialDaysLeft(ended, NOW)).toBeNull();
        expect(trialExpired(ended, NOW)).toBe(true);
    });

    it('trusts Stripe for a card-backed trial (the webhook ends it)', () => {
        const s = sub({ stripe_subscription_id: 'sub_1', source: 'stripe', trial_ends_at: at(NOW - 1000) });
        expect(effectivePlan(s, NOW)).toBe('business');
    });

    it('active and past_due keep the plan; canceled and incomplete are Free', () => {
        const paid = { stripe_subscription_id: 'sub_1', source: 'stripe' as const, plan: 'team' as const, trial_ends_at: null };
        expect(effectivePlan(sub({ ...paid, status: 'active' }), NOW)).toBe('team');
        expect(effectivePlan(sub({ ...paid, status: 'past_due' }), NOW)).toBe('team');
        expect(effectivePlan(sub({ ...paid, status: 'canceled' }), NOW)).toBe('free');
        expect(effectivePlan(sub({ ...paid, status: 'incomplete' }), NOW)).toBe('free');
    });

    it('grandfathered organizations keep Business with no end', () => {
        const s = sub({ status: 'active', source: 'grandfathered', trial_ends_at: null });
        expect(effectivePlan(s, NOW + 3650 * DAY)).toBe('business');
        expect(isTrialActive(s, NOW)).toBe(false);
    });
});

describe('manual grants (Superadmin gifts)', () => {
    it('an active grant wins over an expired trial', () => {
        const s = sub({ trial_ends_at: at(NOW - DAY), manual_plan: 'team' });
        expect(hasActiveGrant(s, NOW)).toBe(true);
        expect(effectivePlan(s, NOW)).toBe('team');
        expect(effectiveSource(s, NOW)).toBe('manual');
        expect(isTrialActive(s, NOW)).toBe(false);
        expect(trialExpired(s, NOW)).toBe(false);
    });

    it('wins over a canceled (or any) Stripe subscription while active', () => {
        const s = sub({ status: 'canceled', stripe_subscription_id: 'sub_1', source: 'stripe', plan: 'team', manual_plan: 'business' });
        expect(effectivePlan(s, NOW)).toBe('business');
    });

    it('ends at manual_until; forever when it is null', () => {
        const until = sub({ status: 'canceled', manual_plan: 'business', manual_until: at(NOW + DAY) });
        expect(effectivePlan(until, NOW)).toBe('business');
        expect(effectivePlan(until, NOW + 2 * DAY)).toBe('free');
        expect(effectiveSource(until, NOW + 2 * DAY)).toBe('trial');
        const forever = sub({ status: 'canceled', manual_plan: 'team', manual_until: null });
        expect(effectivePlan(forever, NOW + 3650 * DAY)).toBe('team');
    });

    it('reports the grant end on the entitlements', () => {
        const until = at(NOW + 10 * DAY);
        const e = buildEntitlements({ subscription: sub({ manual_plan: 'team', manual_until: until }), now: NOW });
        expect(e.plan).toBe('team');
        expect(e.source).toBe('manual');
        expect(e.grantUntil).toBe(until);
        expect(e.isTrial).toBe(false);
    });
});

describe('a paid subscription ended (planEnded)', () => {
    const stripeSub = (over: Partial<Subscription> = {}) =>
        sub({
            plan: 'team',
            status: 'active',
            interval: 'month',
            seats: 1,
            trial_ends_at: null,
            current_period_end: at(NOW - 2 * DAY),
            stripe_customer_id: 'cus_1',
            stripe_subscription_id: 'sub_1',
            source: 'stripe',
            ...over,
        });

    it('canceled Stripe subscription → Free, planEnded, with the ended subscription id', () => {
        const s = stripeSub({ status: 'canceled' });
        expect(effectivePlan(s, NOW)).toBe('free');
        expect(subscriptionEnded(s, NOW)).toBe(true);
        const e = buildEntitlements({ subscription: s, now: NOW });
        expect(e.planEnded).toBe(true);
        expect(e.endedSubscriptionId).toBe('sub_1');
        expect(e.trialExpired).toBe(false);
    });

    it('not while it still runs (active, trialing, past_due, cancel scheduled)', () => {
        for (const status of ['active', 'trialing', 'past_due'] as const) {
            expect(subscriptionEnded(stripeSub({ status }), NOW)).toBe(false);
        }
        expect(subscriptionEnded(stripeSub({ cancel_at_period_end: true, current_period_end: at(NOW + 5 * DAY) }), NOW)).toBe(false);
        expect(buildEntitlements({ subscription: stripeSub(), now: NOW }).endedSubscriptionId).toBeNull();
    });

    it('not for an active gift, grandfathered orgs, our no-card trial, or no row', () => {
        expect(subscriptionEnded(stripeSub({ status: 'canceled', manual_plan: 'business' }), NOW)).toBe(false);
        expect(subscriptionEnded(stripeSub({ status: 'canceled', manual_plan: 'business', manual_until: at(NOW - DAY) }), NOW)).toBe(true);
        expect(subscriptionEnded(stripeSub({ status: 'canceled', source: 'grandfathered' }), NOW)).toBe(false);
        expect(subscriptionEnded(sub({ trial_ends_at: at(NOW - DAY) }), NOW)).toBe(false);
        expect(subscriptionEnded(sub({ status: 'canceled' }), NOW)).toBe(false); // never had a Stripe subscription
        expect(subscriptionEnded(null, NOW)).toBe(false);
    });
});

describe('limits by plan', () => {
    it('Free: 5 members, 1 location; Team: 15 members, 3 locations; Business unlimited', () => {
        expect(LIMITS.free).toEqual({ members: 5, locations: 1 });
        expect(LIMITS.team).toEqual({ members: 15, locations: 3 });
        expect(LIMITS.business).toEqual({ members: null, locations: null });
    });

    it('blocks the 6th member and the 2nd location on Free', () => {
        expect(fitsLimit('free', 'members', 4)).toBe(true);
        expect(fitsLimit('free', 'members', 5)).toBe(false);
        expect(fitsLimit('free', 'locations', 0)).toBe(true);
        expect(fitsLimit('free', 'locations', 1)).toBe(false);
    });

    it('blocks the 16th member and the 4th location on Team', () => {
        expect(fitsLimit('team', 'members', 14)).toBe(true);
        expect(fitsLimit('team', 'members', 15)).toBe(false);
        expect(fitsLimit('team', 'locations', 2)).toBe(true);
        expect(fitsLimit('team', 'locations', 3)).toBe(false);
    });

    it('never blocks on Business', () => {
        expect(fitsLimit('business', 'members', 500)).toBe(true);
        expect(fitsLimit('business', 'locations', 50)).toBe(true);
    });

    it('marks data above the limit after falling back (read-only, not deleted)', () => {
        const e = buildEntitlements({ subscription: sub({ trial_ends_at: at(NOW - DAY) }), usage: { members: 8, locations: 2 }, now: NOW });
        expect(e.plan).toBe('free');
        expect(e.canAdd('members')).toBe(false);
        expect(e.overLimit('members')).toBe(true);
        expect(e.overLimit('locations')).toBe(true);
    });

    it('lets the server decide while usage is unknown', () => {
        const e = buildEntitlements({ subscription: null, usage: null, now: NOW });
        expect(e.canAdd('members')).toBe(true);
        expect(e.overLimit('members')).toBe(false);
    });
});

describe('features by plan', () => {
    const at = (plan: 'free' | 'team' | 'business') =>
        buildEntitlements({
            subscription: plan === 'free' ? null : sub({ plan, status: 'active', source: 'stripe', stripe_subscription_id: 'sub_1', trial_ends_at: null }),
            now: NOW,
        });

    it('Free has only the core', () => {
        const e = at('free');
        for (const f of ['timesheets', 'exports', 'customRoles', 'push', 'activityLog'] as const) expect(e.can(f), f).toBe(false);
    });

    it('Team unlocks timesheets, exports, swaps, templates, push, wages, custom roles — not Business extras', () => {
        const e = at('team');
        for (const f of ['timesheets', 'exports', 'swaps', 'openShifts', 'templates', 'push', 'wages', 'customRoles'] as const) expect(e.can(f), f).toBe(true);
        for (const f of ['activityLog', 'analytics', 'coverage', 'restRules'] as const) expect(e.can(f), f).toBe(false);
    });

    it('Business unlocks everything', () => {
        const e = at('business');
        for (const f of ['timesheets', 'activityLog', 'analytics', 'coverage', 'restRules', 'prioritySupport', 'earlyAccess'] as const) expect(e.can(f), f).toBe(true);
    });

    it('names the cheapest plan for a feature', () => {
        expect(requiredPlan('timesheets')).toBe('team');
        expect(requiredPlan('activityLog')).toBe('business');
        expect(requiredPlan('analytics')).toBe('business');
    });

    it('free beta: Business for everyone — no trial, no ended state, no limits', () => {
        const expired: Subscription = {
            organization_id: 'org1', plan: 'business', status: 'trialing', interval: null, seats: null,
            trial_ends_at: new Date(NOW - 86_400_000).toISOString(), current_period_end: null, cancel_at_period_end: false,
            stripe_customer_id: null, stripe_subscription_id: null, source: 'trial', manual_plan: null, manual_until: null, manual_note: null,
        };
        const e = buildEntitlements({ subscription: expired, usage: { members: 40, locations: 7 }, freeBeta: true, now: NOW });
        expect(e.freeBeta).toBe(true);
        expect(e.plan).toBe('business');
        expect([e.isTrial, e.trialExpired, e.planEnded]).toEqual([false, false, false]);
        expect(e.can('activityLog')).toBe(true);
        expect(e.can('analytics')).toBe(true);
        expect(e.canAdd('members')).toBe(true);
        expect(e.overLimit('locations')).toBe(false);
        // Off: the same row is an expired trial on Free.
        const off = buildEntitlements({ subscription: expired, usage: { members: 40, locations: 7 }, now: NOW });
        expect([off.freeBeta, off.plan, off.trialExpired]).toEqual([false, 'free', true]);
    });

    it('free beta: Business for everyone — no trial, no ended state, no limits', () => {
        const expired: Subscription = {
            organization_id: 'org1', plan: 'business', status: 'trialing', interval: null, seats: null,
            trial_ends_at: new Date(NOW - 86_400_000).toISOString(), current_period_end: null, cancel_at_period_end: false,
            stripe_customer_id: null, stripe_subscription_id: null, source: 'trial', manual_plan: null, manual_until: null, manual_note: null,
        };
        const e = buildEntitlements({ subscription: expired, usage: { members: 40, locations: 7 }, freeBeta: true, now: NOW });
        expect(e.freeBeta).toBe(true);
        expect(e.plan).toBe('business');
        expect([e.isTrial, e.trialExpired, e.planEnded]).toEqual([false, false, false]);
        expect(e.can('activityLog')).toBe(true);
        expect(e.canAdd('members')).toBe(true);
        expect(e.overLimit('locations')).toBe(false);
        // Off: the same row is an expired trial on Free.
        const off = buildEntitlements({ subscription: expired, usage: { members: 40, locations: 7 }, now: NOW });
        expect([off.freeBeta, off.plan, off.trialExpired]).toEqual([false, 'free', true]);
    });

    it('Superadmin bypasses every gate and limit', () => {
        const e = buildEntitlements({ subscription: null, usage: { members: 99, locations: 9 }, superadmin: true, now: NOW });
        expect(e.can('activityLog')).toBe(true);
        expect(e.canAdd('members')).toBe(true);
        expect(e.overLimit('members')).toBe(false);
    });
});

describe('billing quantities and prices', () => {
    it('Team is flat (quantity 1) whatever the member count', () => {
        expect(billedQuantity('team', 1)).toBe(1);
        expect(billedQuantity('team', 15)).toBe(1);
        expect(monthlyEstimateCzk('team', 'month', 12)).toBe(449);
        expect(monthlyEstimateCzk('team', 'year', 12)).toBe(359);
    });

    it('Business bills members with a minimum of 10', () => {
        expect(BUSINESS_MIN_SEATS).toBe(10);
        expect(billedQuantity('business', 3)).toBe(10);
        expect(billedQuantity('business', 23)).toBe(23);
        expect(monthlyEstimateCzk('business', 'month', 23)).toBe(1035);
        expect(monthlyEstimateCzk('business', 'month', 4)).toBe(450);
        expect(monthlyEstimateCzk('business', 'year', 23)).toBe(828);
    });

    it('yearly saves 20 %', () => {
        expect(yearlySavingPct('team')).toBe(20);
        expect(yearlySavingPct('business')).toBe(20);
    });
});
