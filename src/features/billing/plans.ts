/**
 * --- PLANS ---
 * The plan catalog (decided 2026-11-21, hybrid pricing): what each plan
 * unlocks, its hard limits and its list prices. Prices are excl. VAT — Stripe
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
    | 'coverage'
    | 'restRules'
    | 'prioritySupport'
    | 'earlyAccess';

export const PLAN_ORDER: readonly Plan[] = ['free', 'team', 'business'];

const TEAM_FEATURES: readonly Feature[] = ['timesheets', 'exports', 'wages', 'customRoles', 'swaps', 'openShifts', 'templates', 'push'];
const BUSINESS_FEATURES: readonly Feature[] = [...TEAM_FEATURES, 'activityLog', 'coverage', 'restRules', 'prioritySupport', 'earlyAccess'];

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

/** List prices per month, excl. VAT. Yearly is the per-month price billed annually. */
export const PRICES: Record<PaidPlan, { unit: 'org' | 'member'; month: { czk: number; eur: number }; year: { czk: number; eur: number } }> = {
    team: { unit: 'org', month: { czk: 449, eur: 17.9 }, year: { czk: 359, eur: 14.3 } },
    business: { unit: 'member', month: { czk: 45, eur: 1.8 }, year: { czk: 36, eur: 1.45 } },
};

/** Quantity Stripe bills for a plan: Team 1 (flat), Business members with a minimum of 10. */
export function billedQuantity(plan: PaidPlan, members: number): number {
    return plan === 'business' ? Math.max(BUSINESS_MIN_SEATS, members) : 1;
}

/** Monthly price estimate in CZK (excl. VAT) for the organization. */
export function monthlyEstimateCzk(plan: PaidPlan, interval: BillingInterval, members: number): number {
    return PRICES[plan][interval].czk * billedQuantity(plan, members);
}

/** Yearly saving vs monthly, in whole percent (the "save 20 %" badge). */
export function yearlySavingPct(plan: PaidPlan): number {
    const p = PRICES[plan];
    return Math.round((1 - p.year.czk / p.month.czk) * 100);
}
