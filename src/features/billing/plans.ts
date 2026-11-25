/**
 * --- PLANS ---
 * The plan catalog (decided 2026-11-21, hybrid pricing): what each plan
 * unlocks, its hard limits and its list prices. Prices are final (not VAT-registered, STRIPE_AUTOMATIC_TAX=false) — Stripe
 * adds it at checkout. Limits are mirrored in the database
 * (`plan_member_limit` / `plan_location_limit` in the billing migration) and
 * in the Edge Functions (`BUSINESS_MIN_SEATS`) — keep them in step.
 *
 *   Free      0 Kč                     5 members · 1 location
 *   Team      449 Kč / month flat      15 members · 3 locations
 *   Business  45 Kč / member / month   unlimited (billed for min. 10)
 */

export type Plan = 'free' | 'team' | 'business';
export type PaidPlan = Exclude<Plan, 'free'>;
export type BillingInterval = 'month' | 'year';

/** Everything a plan can unlock. Core (clock in/out, rota, requests, …) is never gated. */
export type Feature =
    // Team
    | 'timesheets' // timesheets page + PDF/XLSX exports
    | 'exports'
    | 'wages'
    | 'customRoles'
    | 'swaps'
    | 'openShifts'
    | 'templates' // shift templates + copy last month
    | 'push'
    // Business
    | 'activityLog'
    | 'analytics' // owner analytics page + org_analytics RPC
    | 'coverage'
    | 'restRules'
    | 'prioritySupport'
    | 'earlyAccess';

export const PLAN_ORDER: readonly Plan[] = ['free', 'team', 'business'];

const TEAM_FEATURES: readonly Feature[] = ['timesheets', 'exports', 'wages', 'customRoles', 'swaps', 'openShifts', 'templates', 'push'];
const BUSINESS_FEATURES: readonly Feature[] = [...TEAM_FEATURES, 'activityLog', 'analytics', 'coverage', 'restRules', 'prioritySupport', 'earlyAccess'];

export const PLAN_FEATURES: Record<Plan, ReadonlySet<Feature>> = {
    free: new Set(),
    team: new Set(TEAM_FEATURES),
    business: new Set(BUSINESS_FEATURES),
};

/** The cheapest plan that includes a feature (for "part of Team" prompts). */
export function requiredPlan(feature: Feature): PaidPlan {
    return PLAN_FEATURES.team.has(feature) ? 'team' : 'business';
}

export interface PlanLimits {
    /** Max members (profiles) in the organization; null = unlimited. */
    members: number | null;
    /** Max active (not archived) locations; null = unlimited. */
    locations: number | null;
}

export const LIMITS: Record<Plan, PlanLimits> = {
    free: { members: 5, locations: 1 },
    team: { members: 15, locations: 3 },
    business: { members: null, locations: null },
};

/** Business is billed per member with this minimum; Team is one flat price. */
export const BUSINESS_MIN_SEATS = 10;

/** Length of the no-card Business trial every new organization gets. */
export const TRIAL_DAYS = 30;

/** List prices per month (final, no VAT added). Yearly is the per-month price billed annually. */
export const PRICES: Record<PaidPlan, { unit: 'org' | 'member'; month: { czk: number; eur: number }; year: { czk: number; eur: number } }> = {
    team: { unit: 'org', month: { czk: 449, eur: 17.9 }, year: { czk: 359, eur: 14.3 } },
    business: { unit: 'member', month: { czk: 45, eur: 1.8 }, year: { czk: 36, eur: 1.45 } },
};

/** Quantity Stripe bills for a plan: Team 1 (flat), Business members with a minimum of 10. */
export function billedQuantity(plan: PaidPlan, members: number): number {
    return plan === 'business' ? Math.max(BUSINESS_MIN_SEATS, members) : 1;
}

/** Monthly price estimate in CZK (final, no VAT) for the organization. */
export function monthlyEstimateCzk(plan: PaidPlan, interval: BillingInterval, members: number): number {
    return PRICES[plan][interval].czk * billedQuantity(plan, members);
}

/**
 * What the organization is billed per billing period (CZK, final): Team one
 * flat price (quantity 1), Business `quantity × unit` with quantity = members,
 * minimum 10. Yearly is the per-month price × 12 (4 308 Kč, 432 Kč / person).
 */
export function billedPrice(plan: PaidPlan, interval: BillingInterval, members: number): { quantity: number; unitCzk: number; totalCzk: number } {
    const quantity = billedQuantity(plan, members);
    const unitCzk = PRICES[plan][interval].czk * (interval === 'year' ? 12 : 1);
    return { quantity, unitCzk, totalCzk: unitCzk * quantity };
}

/**
 * How Stripe settles an in-place plan change: an upgrade (Team → Business or
 * monthly → yearly) is charged now (prorated), a downgrade is credited to the
 * next invoice, and nothing is charged while trialing. Mirrors
 * `prorationForChange()` in supabase/functions/_shared/billing.ts.
 */
export function changeKind(
    from: { plan: PaidPlan; interval: BillingInterval },
    to: { plan: PaidPlan; interval: BillingInterval },
    trialing: boolean,
): 'trial' | 'upgrade' | 'downgrade' {
    if (trialing) return 'trial';
    const rank = (p: PaidPlan) => (p === 'business' ? 2 : 1);
    return rank(to.plan) > rank(from.plan) || (from.interval === 'month' && to.interval === 'year') ? 'upgrade' : 'downgrade';
}

/** Yearly saving vs monthly, in whole percent (the "save 20 %" badge). */
export function yearlySavingPct(plan: PaidPlan): number {
    const p = PRICES[plan];
    return Math.round((1 - p.year.czk / p.month.czk) * 100);
}
