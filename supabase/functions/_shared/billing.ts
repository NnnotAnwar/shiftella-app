// =============================================================================
// SHARED: billing helpers for the Edge Functions (Stripe + subscriptions).
// -----------------------------------------------------------------------------
// Used by billing-checkout, billing-change-plan, billing-portal, stripe-webhook
// and — for keeping the
// Business seat count in step — invite-employee, delete-employee and
// delete-account. Stripe is loaded lazily (dynamic import) so the member
// functions don't pay its cold-start cost unless an org actually has a paid
// Business subscription.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_TEAM_MONTH,
// STRIPE_PRICE_TEAM_YEAR, STRIPE_PRICE_BUSINESS_MONTH,
// STRIPE_PRICE_BUSINESS_YEAR, APP_URL (+ optional STRIPE_AUTOMATIC_TAX=false).
// =============================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type Stripe from 'npm:stripe@17.7.0';

export type Plan = 'free' | 'team' | 'business';
export type PaidPlan = 'team' | 'business';
export type Interval = 'month' | 'year';
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

/** Business bills per member with this minimum; Team is a flat price (quantity 1). */
export const BUSINESS_MIN_SEATS = 10;

/** Team's hard limits (mirrors LIMITS.team in src/features/billing/plans.ts and plan_*_limit in SQL). */
export const TEAM_MAX_MEMBERS = 15;
export const TEAM_MAX_LOCATIONS = 3;

/** Stripe statuses that still bill (and so can be changed in place). */
export const LIVE_STATUSES: readonly string[] = ['trialing', 'active', 'past_due'];

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

export function serviceClient(): SupabaseClient {
    return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

// --- Stripe ---------------------------------------------------------------------

let stripeSingleton: Stripe | null = null;

/** The Stripe client (throws a readable error when billing isn't configured). */
export async function stripeClient(): Promise<Stripe> {
    if (stripeSingleton) return stripeSingleton;
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) throw new Error('Billing is not configured yet (STRIPE_SECRET_KEY is missing).');
    const { default: StripeCtor } = await import('npm:stripe@17.7.0');
    stripeSingleton = new StripeCtor(key, {
        // Pinned: current_period_end still lives on the subscription in this version.
        apiVersion: '2025-02-24.acacia',
        httpClient: StripeCtor.createFetchHttpClient(),
    }) as Stripe;
    return stripeSingleton;
}

export async function subtleCryptoProvider() {
    const { default: StripeCtor } = await import('npm:stripe@17.7.0');
    return StripeCtor.createSubtleCryptoProvider();
}

const PRICE_ENV: Record<PaidPlan, Record<Interval, string>> = {
    team: { month: 'STRIPE_PRICE_TEAM_MONTH', year: 'STRIPE_PRICE_TEAM_YEAR' },
    business: { month: 'STRIPE_PRICE_BUSINESS_MONTH', year: 'STRIPE_PRICE_BUSINESS_YEAR' },
};

/** The Stripe price id for a plan + interval (from the secrets). */
export function priceFor(plan: PaidPlan, interval: Interval): string {
    const id = Deno.env.get(PRICE_ENV[plan][interval]);
    if (!id) throw new Error(`Billing is not configured yet (${PRICE_ENV[plan][interval]} is missing).`);
    return id;
}

/** Which plan + interval a Stripe price id stands for (null = not one of ours). */
export function planForPrice(priceId: string | null | undefined): { plan: PaidPlan; interval: Interval } | null {
    if (!priceId) return null;
    for (const plan of ['team', 'business'] as const) {
        for (const interval of ['month', 'year'] as const) {
            if (Deno.env.get(PRICE_ENV[plan][interval]) === priceId) return { plan, interval };
        }
    }
    return null;
}

/** Quantity Stripe bills: Team is flat (1), Business is members with a minimum of 10. */
export function quantityFor(plan: PaidPlan, members: number): number {
    return plan === 'business' ? Math.max(BUSINESS_MIN_SEATS, members) : 1;
}

// --- Plan changes ------------------------------------------------------------------

export type ProrationBehavior = 'always_invoice' | 'create_prorations' | 'none';

const PLAN_RANK: Record<PaidPlan, number> = { team: 1, business: 2 };

/**
 * An upgrade is a higher plan (Team → Business) or a longer interval (monthly →
 * yearly); everything else is a downgrade. Mirrors `changeKind()` in
 * src/features/billing/plans.ts — keep them in step.
 */
export function isUpgrade(from: { plan: PaidPlan; interval: Interval }, to: { plan: PaidPlan; interval: Interval }): boolean {
    return PLAN_RANK[to.plan] > PLAN_RANK[from.plan] || (from.interval === 'month' && to.interval === 'year');
}

/**
 * How Stripe settles a plan / interval change (billing-change-plan):
 *   • trialing  → 'none' (nothing has been paid; the trial just continues)
 *   • upgrade   → 'always_invoice' (the prorated difference is charged now)
 *   • downgrade → 'create_prorations' (the unused part is a credit on the next invoice)
 */
export function prorationForChange(
    from: { plan: PaidPlan; interval: Interval },
    to: { plan: PaidPlan; interval: Interval },
    status: string,
): ProrationBehavior {
    if (status === 'trialing') return 'none';
    return isUpgrade(from, to) ? 'always_invoice' : 'create_prorations';
}

/**
 * Stripe `payment_behavior` for a plan change. An upgrade charged right now
 * ('always_invoice') uses 'pending_if_incomplete': Stripe applies the new plan
 * only once that invoice is paid — a declined card or a 3-D Secure check leaves
 * the subscription as it was (with a `pending_update`) instead of handing out
 * Business on an unpaid invoice. Everything else charges nothing now, so the
 * default 'allow_incomplete' is fine.
 */
export function paymentBehaviorFor(proration: ProrationBehavior): 'pending_if_incomplete' | 'allow_incomplete' {
    return proration === 'always_invoice' ? 'pending_if_incomplete' : 'allow_incomplete';
}

// --- billing-change-plan requests -------------------------------------------------

/**
 * What a billing-change-plan body asks for:
 *   { plan: 'team' | 'business', interval: 'month' | 'year' } → switch in place
 *   { plan: 'free' }                                         → cancel at period end
 *   { action: 'resume' }                                     → undo a scheduled cancel
 * null = a body we don't understand (400).
 */
export type ChangeRequest =
    | { kind: 'switch'; plan: PaidPlan; interval: Interval }
    | { kind: 'cancel' }
    | { kind: 'resume' };

export function parseChangeRequest(body: unknown): ChangeRequest | null {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (b.action === 'resume') return { kind: 'resume' };
    if (b.action !== undefined) return null;
    if (b.plan === 'free') return { kind: 'cancel' };
    const plan = b.plan === 'team' || b.plan === 'business' ? b.plan : null;
    const interval = b.interval === 'month' || b.interval === 'year' ? b.interval : null;
    return plan && interval ? { kind: 'switch', plan, interval } : null;
}

export type ChangeRefusalCode = 'GRANTED' | 'GRANDFATHERED' | 'NO_SUBSCRIPTION';

/**
 * Why the org's row can't be changed in place (409), or null when it can:
 * a Superadmin gift (GRANTED), grandfathered (GRANDFATHERED), or no live
 * Stripe subscription (NO_SUBSCRIPTION — the client starts Checkout instead).
 * The same for switch, cancel (→ Free) and resume.
 */
export function changeRefusal(
    row: Pick<SubscriptionRow, 'manual_plan' | 'manual_until' | 'source' | 'status' | 'stripe_subscription_id'> | null,
    now = Date.now(),
): { error: string; code: ChangeRefusalCode } | null {
    if (hasActiveGrant(row, now)) return { error: 'Your plan was granted by Shiftella — nothing to pay.', code: 'GRANTED' };
    if (row?.source === 'grandfathered') return { error: 'Your organization already has Business for free.', code: 'GRANDFATHERED' };
    if (!row?.stripe_subscription_id || !LIVE_STATUSES.includes(row.status)) {
        return { error: 'There is no active subscription to change — pick a plan first.', code: 'NO_SUBSCRIPTION' };
    }
    return null;
}

/**
 * The `cancel_at_period_end` a cancel (→ Free) / resume sets, or null when
 * Stripe already has it (→ `{ ok: true, unchanged: true }`). Only this flag
 * moves: no charge, no proration, the plan runs until the period (or the
 * Stripe trial) ends.
 */
export function cancelFlagTarget(kind: 'cancel' | 'resume', scheduled: boolean): boolean | null {
    const target = kind === 'cancel';
    return target === !!scheduled ? null : target;
}

/** When a cancel-scheduled subscription ends (ISO): Stripe's `cancel_at`, else the period end (= trial end while trialing). */
export function endsAtOf(sub: { cancel_at?: number | null; current_period_end?: number | null }): string | null {
    return iso(sub.cancel_at ?? sub.current_period_end ?? null);
}

/** Stripe's subscription status → ours. Lapsed/paused/unpaid lose access (free). */
export function mapStatus(s: Stripe.Subscription.Status): SubStatus {
    switch (s) {
        case 'trialing':
        case 'active':
        case 'past_due':
            return s;
        case 'incomplete':
        case 'incomplete_expired':
            return 'incomplete';
        default: // canceled, unpaid, paused
            return 'canceled';
    }
}

// --- Caller / permission ----------------------------------------------------------

export interface BillingCaller {
    admin: SupabaseClient;
    userId: string;
    email: string | null;
    organizationId: string;
}

/**
 * Identify the caller from their JWT and require billing rights: Superadmin or
 * Head Admin (has_permission short-circuits rank >= 40 for every area; there is
 * no grantable 'billing' area yet, so this is forward-compatible).
 */
export async function requireBillingCaller(req: Request): Promise<BillingCaller | Response> {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header.' }, 401);
    const callerClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await callerClient.auth.getUser();
    if (error || !user) return json({ error: 'Invalid or expired session.' }, 401);

    const admin = serviceClient();
    const { data: profile } = await admin.from('profiles').select('organization_id').eq('id', user.id).single();
    if (!profile) return json({ error: 'Caller profile not found.' }, 403);
    const { data: mayBill } = await admin.rpc('profile_has_permission', { p_user: user.id, p_area: 'billing', p_action: 'write' });
    if (!mayBill) return json({ error: 'Only the organization owner can manage billing.' }, 403);
    return { admin, userId: user.id, email: user.email ?? null, organizationId: profile.organization_id };
}

// --- Subscriptions table ------------------------------------------------------------

export interface SubscriptionRow {
    organization_id: string;
    plan: Plan;
    status: SubStatus;
    interval: Interval | null;
    seats: number | null;
    trial_ends_at: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    source: 'trial' | 'stripe' | 'grandfathered' | 'manual';
    manual_plan: PaidPlan | null;
    manual_until: string | null;
}

export async function loadSubscription(admin: SupabaseClient, orgId: string): Promise<SubscriptionRow | null> {
    const { data } = await admin.from('subscriptions').select('*').eq('organization_id', orgId).maybeSingle();
    return (data as SubscriptionRow | null) ?? null;
}

export function hasActiveGrant(row: Pick<SubscriptionRow, 'manual_plan' | 'manual_until'> | null, now = Date.now()): boolean {
    return !!row?.manual_plan && (!row.manual_until || new Date(row.manual_until).getTime() > now);
}

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

/**
 * Write a Stripe subscription onto its organization's row. Always re-reads the
 * subscription from Stripe first (events can arrive out of order), and never
 * touches the manual_* grant columns — an active Superadmin grant keeps winning
 * in org_plan() whatever Stripe says.
 */
export async function syncFromStripe(admin: SupabaseClient, subscriptionId: string, orgHint?: string | null): Promise<string | null> {
    const stripe = await stripeClient();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

    let orgId = sub.metadata?.organization_id || orgHint || null;
    if (!orgId) {
        const { data } = await admin.from('subscriptions').select('organization_id').eq('stripe_customer_id', customerId).maybeSingle();
        orgId = data?.organization_id ?? null;
    }
    if (!orgId) {
        console.warn('[billing] no organization for subscription', subscriptionId);
        return null;
    }

    const current = await loadSubscription(admin, orgId);
    const status = mapStatus(sub.status);
    // A stale event for an OLD subscription must not clobber a newer one.
    if (current?.stripe_subscription_id && current.stripe_subscription_id !== sub.id && (status === 'canceled' || status === 'incomplete')) {
        return orgId;
    }

    const item = sub.items.data[0];
    const mapped = planForPrice(item?.price?.id) ?? {
        plan: (item?.price?.metadata?.plan === 'team' ? 'team' : 'business') as PaidPlan,
        interval: (item?.price?.recurring?.interval === 'year' ? 'year' : 'month') as Interval,
    };

    const row = {
        organization_id: orgId,
        plan: mapped.plan,
        status,
        interval: mapped.interval,
        seats: item?.quantity ?? null,
        trial_ends_at: iso(sub.trial_end),
        current_period_end: iso(sub.current_period_end),
        cancel_at_period_end: !!sub.cancel_at_period_end,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        source: 'stripe' as const,
    };
    const { error } = await admin.from('subscriptions').upsert(row, { onConflict: 'organization_id' });
    if (error) throw new Error(`Could not save the subscription: ${error.message}`);
    return orgId;
}

/**
 * Keep a Business subscription's quantity equal to the member count (min. 10).
 * Team is flat: its quantity is held at 1 (a safety net — plan switches go
 * through billing-change-plan, which already sets the right quantity).
 * Orgs without a live Stripe subscription (trial, grandfathered, gifts) are
 * skipped. Best effort: never throws.
 */
export async function syncSeats(admin: SupabaseClient, orgId: string | null | undefined, opts: { prorate?: boolean } = {}): Promise<void> {
    if (!orgId) return;
    try {
        const row = await loadSubscription(admin, orgId);
        if (!row?.stripe_subscription_id || (row.plan !== 'business' && row.plan !== 'team')) return;
        if (row.status === 'canceled' || row.status === 'incomplete') return;
        if (row.plan === 'team' && row.seats === 1) return; // flat — nothing to do
        if (!Deno.env.get('STRIPE_SECRET_KEY')) return;

        let members = 0;
        if (row.plan === 'business') {
            const { data } = await admin.rpc('org_member_count', { p_org: orgId });
            members = Number(data ?? 0);
        }
        const qty = quantityFor(row.plan, members);
        const stripe = await stripeClient();
        const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        const item = sub.items.data[0];
        if (!item) return;
        if (item.quantity !== qty) {
            // Monthly: prorations ride on the next invoice (at most a month away).
            // Yearly: extra seats are invoiced right away (the next invoice could
            // be months off); fewer seats leave a credit for the next invoice.
            // At renewal (prorate: false) the count is simply corrected.
            const yearlyIncrease = row.interval === 'year' && qty > (item.quantity ?? 0);
            await stripe.subscriptions.update(sub.id, {
                items: [{ id: item.id, quantity: qty }],
                proration_behavior: opts.prorate === false ? 'none' : yearlyIncrease ? 'always_invoice' : 'create_prorations',
            });
        }
        if (row.seats !== qty) await admin.from('subscriptions').update({ seats: qty }).eq('organization_id', orgId);
    } catch (err) {
        console.error('[billing] seat sync failed', orgId, err);
    }
}

// --- Customer Portal configuration ----------------------------------------------------

const PORTAL_CONFIG_TAG = 'v2';
let portalConfigId: string | null = null;

/**
 * The Customer Portal configuration billing-portal opens: card, invoices,
 * billing details and cancel (at period end) — but **no plan switching**.
 * Stripe would carry the Business quantity over to Team (10 × 449 Kč); plan and
 * interval changes go through billing-change-plan instead. Found by
 * `metadata.shiftella = 'v2'` (created on first use, so live mode configures
 * itself) and cached per instance.
 */
export async function ensurePortalConfiguration(stripe: Stripe): Promise<string> {
    if (portalConfigId) return portalConfigId;
    const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
    const found = list.data.find((c) => c.metadata?.shiftella === PORTAL_CONFIG_TAG);
    if (found) {
        portalConfigId = found.id;
        return found.id;
    }
    const created = await stripe.billingPortal.configurations.create({
        business_profile: { headline: 'Shiftella – manage your subscription' },
        features: {
            customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_cancel: { enabled: true, mode: 'at_period_end' },
            subscription_update: { enabled: false },
        },
        metadata: { shiftella: PORTAL_CONFIG_TAG },
    });
    portalConfigId = created.id;
    return created.id;
}

/** Where Checkout / the Portal send people back to. */
export function appUrl(): string {
    const url = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || '';
    if (!url) throw new Error('Billing is not configured yet (APP_URL is missing).');
    return url.replace(/\/+$/, '');
}
