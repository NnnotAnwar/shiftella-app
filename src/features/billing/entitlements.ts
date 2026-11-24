import { LIMITS, PLAN_FEATURES, type BillingInterval, type Feature, type PaidPlan, type Plan, type PlanLimits } from './plans';

/**
 * --- ENTITLEMENTS ---
 * Pure logic: from an organization's `subscriptions` row to what it may use.
 * Mirrors `public._effective_plan()` in the billing migration — keep in step.
 *
 *   1. An active Superadmin grant (manual_plan, manual_until in the future or
 *      NULL) wins over everything, Stripe included.
 *   2. Our own no-card trial ends at trial_ends_at (a Stripe-backed trial is
 *      ended by Stripe, whose webhook flips the status).
 *   3. trialing / active / past_due (grace while Stripe retries) → the plan.
 *   4. canceled / incomplete / no row → Free.
 * Superadmin bypasses every gate and limit.
 * Free beta (app_settings.free_beta, mirrored in `org_plan()`): every
 * organization gets Business, no trial / ended states, no limits.
 */

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
export type SubscriptionSource = 'trial' | 'stripe' | 'grandfathered' | 'manual';

export interface Subscription {
    organization_id: string;
    plan: Plan;
    status: SubscriptionStatus;
    interval: BillingInterval | null;
    seats: number | null;
    trial_ends_at: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    source: SubscriptionSource;
    manual_plan: PaidPlan | null;
    manual_until: string | null;
    manual_note: string | null;
}

export interface OrgUsage {
    members: number;
    locations: number;
}

/** What limits apply to: members (profiles) and active locations. */
export type LimitKind = keyof PlanLimits;

const DAY_MS = 24 * 60 * 60 * 1000;
const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** A Superadmin's free grant that hasn't run out. */
export function hasActiveGrant(sub: Pick<Subscription, 'manual_plan' | 'manual_until'> | null | undefined, now = Date.now()): boolean {
    if (!sub?.manual_plan) return false;
    return !sub.manual_until || time(sub.manual_until) > now;
}

/** The plan the organization actually gets right now. */
export function effectivePlan(sub: Subscription | null | undefined, now = Date.now()): Plan {
    if (!sub) return 'free';
    if (hasActiveGrant(sub, now)) return sub.manual_plan!;
    if (sub.status === 'trialing' && !sub.stripe_subscription_id) {
        return time(sub.trial_ends_at) > now ? sub.plan : 'free';
    }
    if (sub.status === 'trialing' || sub.status === 'active' || sub.status === 'past_due') return sub.plan;
    return 'free';
}

/** Running a trial (ours or Stripe's) that hasn't ended — and no grant overrides it. */
export function isTrialActive(sub: Subscription | null | undefined, now = Date.now()): boolean {
    if (!sub || sub.status !== 'trialing' || hasActiveGrant(sub, now)) return false;
    return effectivePlan(sub, now) !== 'free' && (!sub.trial_ends_at || time(sub.trial_ends_at) > now);
}

/** Whole days left on the trial (rounded up: "1 day" until the very end); null when not trialing. */
export function trialDaysLeft(sub: Subscription | null | undefined, now = Date.now()): number | null {
    if (!isTrialActive(sub, now) || !sub?.trial_ends_at) return null;
    return Math.max(0, Math.ceil((time(sub.trial_ends_at) - now) / DAY_MS));
}

/** Our no-card trial ran out and nothing replaced it. */
export function trialExpired(sub: Subscription | null | undefined, now = Date.now()): boolean {
    return !!sub && sub.status === 'trialing' && !sub.stripe_subscription_id && !hasActiveGrant(sub, now) && effectivePlan(sub, now) === 'free';
}

/**
 * A paid Stripe subscription ended (canceled — by the customer, or Stripe gave
 * up on payment) and nothing replaced it: no active gift, not grandfathered,
 * the org sits on Free. Our no-card trial running out is `trialExpired` instead.
 */
export function subscriptionEnded(sub: Subscription | null | undefined, now = Date.now()): boolean {
    return (
        !!sub &&
        sub.status === 'canceled' &&
        !!sub.stripe_subscription_id &&
        sub.source !== 'grandfathered' &&
        !hasActiveGrant(sub, now) &&
        effectivePlan(sub, now) === 'free'
    );
}

/** Where today's plan comes from ('manual' while a grant is active). */
export function effectiveSource(sub: Subscription | null | undefined, now = Date.now()): SubscriptionSource | 'none' {
    if (!sub) return 'none';
    if (hasActiveGrant(sub, now)) return 'manual';
    return sub.source;
}

/** Whether one more member / location fits under a plan's limit. */
export function fitsLimit(plan: Plan, kind: LimitKind, current: number): boolean {
    const max = LIMITS[plan][kind];
    return max === null || current < max;
}

export interface Entitlements {
    plan: Plan;
    isTrial: boolean;
    trialDaysLeft: number | null;
    trialExpired: boolean;
    /** A paid (Stripe) subscription ended and the org is on Free — see `subscriptionEnded()`. */
    planEnded: boolean;
    /** The Stripe subscription that ended (while `planEnded`), so a later one that ends asks again. */
    endedSubscriptionId: string | null;
    /** Stripe's last charge failed and it is retrying (the plan still runs) — not while a grant overrides it. */
    pastDue: boolean;
    source: SubscriptionSource | 'none';
    /** Active grant's end (null = forever, or no grant). */
    grantUntil: string | null;
    limits: PlanLimits;
    usage: OrgUsage | null;
    /** Superadmin: every gate open. */
    bypass: boolean;
    /** The free beta is on: Business for everyone, nothing to buy. */
    freeBeta: boolean;
    can: (feature: Feature) => boolean;
    /** May one more member / location be added (unknown usage → yes; the server decides). */
    canAdd: (kind: LimitKind) => boolean;
    /** Already above a limit (e.g. 8 members after falling back to Free). */
    overLimit: (kind: LimitKind) => boolean;
}

export function buildEntitlements({
    subscription,
    usage = null,
    superadmin = false,
    freeBeta = false,
    now = Date.now(),
}: {
    subscription: Subscription | null | undefined;
    usage?: OrgUsage | null;
    superadmin?: boolean;
    freeBeta?: boolean;
    now?: number;
}): Entitlements {
    if (freeBeta) {
        return {
            plan: 'business',
            isTrial: false,
            trialDaysLeft: null,
            trialExpired: false,
            planEnded: false,
            endedSubscriptionId: null,
            pastDue: subscription?.status === 'past_due' && !hasActiveGrant(subscription, now),
            source: effectiveSource(subscription, now),
            grantUntil: null,
            limits: LIMITS.business,
            usage,
            bypass: superadmin,
            freeBeta: true,
            can: () => true,
            canAdd: () => true,
            overLimit: () => false,
        };
    }
    const plan = effectivePlan(subscription, now);
    const limits = LIMITS[plan];
    const grant = hasActiveGrant(subscription, now);
    const ended = subscriptionEnded(subscription, now);
    return {
        plan,
        isTrial: isTrialActive(subscription, now),
        trialDaysLeft: trialDaysLeft(subscription, now),
        trialExpired: trialExpired(subscription, now),
        planEnded: ended,
        endedSubscriptionId: ended ? subscription?.stripe_subscription_id ?? null : null,
        pastDue: !grant && subscription?.status === 'past_due',
        source: effectiveSource(subscription, now),
        grantUntil: grant ? subscription?.manual_until ?? null : null,
        limits,
        usage,
        bypass: superadmin,
        freeBeta: false,
        can: (feature) => superadmin || PLAN_FEATURES[plan].has(feature),
        canAdd: (kind) => superadmin || !usage || fitsLimit(plan, kind, usage[kind]),
        overLimit: (kind) => !superadmin && !!usage && limits[kind] !== null && usage[kind] > (limits[kind] as number),
    };
}
