import { supabase } from '@shared/api/supabaseClient';
import type { BillingInterval, PaidPlan } from './plans';
import type { OrgUsage, Subscription } from './entitlements';

/**
 * --- BILLING SERVICE ---
 * Reads the organization's subscription row (RLS: own org, Superadmin all) and
 * talks to the billing Edge Functions. Clients never write `subscriptions` —
 * Checkout / Portal run on Stripe; plan switches, "switch to Free" (cancel at
 * period end) and resume go through billing-change-plan; the webhook writes
 * the row; a Superadmin's free grant goes through the admin_* RPCs.
 */

/** A billing function's error, with its machine-readable `code` (e.g. PLAN_LIMIT_MEMBERS) when it sent one. */
export class BillingError extends Error {
    code?: string;
    limit?: number;
    count?: number;
    /** PAYMENT_REQUIRED: Stripe's page for paying the upgrade invoice. */
    url?: string;
    constructor(message: string, extra: { code?: string; limit?: number; count?: number; url?: string } = {}) {
        super(message);
        this.name = 'BillingError';
        Object.assign(this, extra);
    }
}

/** Read a function's `{ error, code }` body on a non-2xx (supabase-js hides it on `error.context`). */
async function invokeError(error: { message: string }): Promise<BillingError> {
    let message = error.message;
    let extra: { code?: string; limit?: number; count?: number; url?: string } = {};
    const resp = (error as { context?: Response }).context;
    if (resp && typeof resp.json === 'function') {
        try {
            const body = await resp.json();
            if (body?.error) message = body.error;
            extra = {
                code: typeof body?.code === 'string' ? body.code : undefined,
                limit: typeof body?.limit === 'number' ? body.limit : undefined,
                count: typeof body?.count === 'number' ? body.count : undefined,
                url: typeof body?.url === 'string' && body.url.startsWith('https://') ? body.url : undefined,
            };
        } catch {
            /* keep the default message */
        }
    }
    return new BillingError(message, extra);
}

async function invokeForUrl(fn: 'billing-checkout' | 'billing-portal', body: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) throw await invokeError(error);
    const url = (data as { url?: string; error?: string })?.url;
    if (!url) throw new Error((data as { error?: string })?.error ?? 'No billing link was returned.');
    return url;
}

/** billing-change-plan: switch, cancel (→ Free) or resume; throws a BillingError with the server's `code`. */
async function invokeChange(body: Record<string, unknown>, fallback: string): Promise<{ unchanged?: boolean; endsAt?: string | null }> {
    const { data, error } = await supabase.functions.invoke('billing-change-plan', { body });
    if (error) throw await invokeError(error);
    const d = (data ?? {}) as { ok?: boolean; unchanged?: boolean; endsAt?: string | null; error?: string; code?: string };
    if (!d.ok) throw new BillingError(d.error ?? fallback, { code: d.code });
    return d;
}

/** The subset a Superadmin's organizations list needs. */
export type OrgPlanRow = Pick<
    Subscription,
    'organization_id' | 'plan' | 'status' | 'source' | 'trial_ends_at' | 'stripe_subscription_id' | 'manual_plan' | 'manual_until' | 'manual_note'
>;

export const billingService = {
    async getSubscription(orgId: string): Promise<Subscription | null> {
        const { data, error } = await supabase.from('subscriptions').select('*').eq('organization_id', orgId).maybeSingle();
        if (error) throw error;
        return (data as Subscription | null) ?? null;
    },

    async getUsage(orgId: string): Promise<OrgUsage> {
        const { data, error } = await supabase.rpc('org_usage', { p_org: orgId });
        if (error) throw error;
        const d = (data ?? {}) as Partial<OrgUsage>;
        return { members: Number(d.members ?? 0), locations: Number(d.locations ?? 0) };
    },

    /** Superadmin: every organization's billing row. */
    async listAll(): Promise<OrgPlanRow[]> {
        const { data, error } = await supabase
            .from('subscriptions')
            .select('organization_id, plan, status, source, trial_ends_at, stripe_subscription_id, manual_plan, manual_until, manual_note');
        if (error) throw error;
        return (data ?? []) as OrgPlanRow[];
    },

    /** Stripe Checkout URL for the caller's organization. */
    checkoutUrl(plan: PaidPlan, interval: BillingInterval, language: string): Promise<string> {
        return invokeForUrl('billing-checkout', { plan, interval, language });
    },

    /**
     * Switch the live Stripe subscription to another plan / interval in place
     * (billing-change-plan). Throws a BillingError with `code` NO_SUBSCRIPTION
     * (use Checkout), PLAN_LIMIT_MEMBERS / PLAN_LIMIT_LOCATIONS (doesn't fit Team),
     * PAYMENT_REQUIRED (an upgrade's charge failed / needs 3-D Secure; `url` = the
     * invoice to pay — the plan changes once it is paid).
     */
    async changePlan(plan: PaidPlan, interval: BillingInterval): Promise<{ unchanged: boolean }> {
        const d = await invokeChange({ plan, interval }, 'The plan could not be changed.');
        return { unchanged: !!d.unchanged };
    },

    /**
     * "Switch to Free": cancel the live subscription at the end of the paid
     * period (or the Stripe trial). `endsAt` = when it ends. Nothing is charged.
     */
    async switchToFree(): Promise<{ unchanged: boolean; endsAt: string | null }> {
        const d = await invokeChange({ plan: 'free' }, 'The subscription could not be cancelled.');
        return { unchanged: !!d.unchanged, endsAt: d.endsAt ?? null };
    },

    /** Undo a scheduled cancel (cancel_at_period_end → false). Nothing is charged. */
    async resume(): Promise<{ unchanged: boolean }> {
        const d = await invokeChange({ action: 'resume' }, 'The subscription could not be resumed.');
        return { unchanged: !!d.unchanged };
    },

    /** Stripe Customer Portal URL for the caller's organization (card, invoices, billing details, cancel). */
    portalUrl(language: string): Promise<string> {
        return invokeForUrl('billing-portal', { language });
    },

    /** Superadmin: grant a plan for free (until = null → forever). */
    async setOrgPlan(orgId: string, plan: PaidPlan, until: string | null, note: string | null): Promise<void> {
        const { error } = await supabase.rpc('admin_set_org_plan', { p_org: orgId, p_plan: plan, p_until: until, p_note: note });
        if (error) throw error;
    },

    /** Superadmin: remove a granted plan (the org goes back to its own subscription / Free). */
    async clearOrgPlan(orgId: string): Promise<void> {
        const { error } = await supabase.rpc('admin_clear_org_plan', { p_org: orgId });
        if (error) throw error;
    },
};
