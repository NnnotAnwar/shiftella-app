import { supabase } from '@shared/api/supabaseClient';
import type { BillingInterval, PaidPlan } from './plans';
import type { OrgUsage, Subscription } from './entitlements';

/**
 * --- BILLING SERVICE ---
 * Reads the organization's subscription row (RLS: own org, Superadmin all) and
 * talks to the billing Edge Functions. Clients never write `subscriptions` —
 * Checkout / Portal run on Stripe, the webhook writes the row, and a
 * Superadmin's free grant goes through the admin_* RPCs.
 */

/** Read a function's `{ error }` body on a non-2xx (supabase-js hides it on `error.context`). */
async function invokeError(error: { message: string }): Promise<Error> {
    let message = error.message;
    const resp = (error as { context?: Response }).context;
    if (resp && typeof resp.json === 'function') {
        try {
            const body = await resp.json();
            if (body?.error) message = body.error;
        } catch {
            /* keep the default message */
        }
    }
    return new Error(message);
}

async function invokeForUrl(fn: 'billing-checkout' | 'billing-portal', body: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) throw await invokeError(error);
    const url = (data as { url?: string; error?: string })?.url;
    if (!url) throw new Error((data as { error?: string })?.error ?? 'No billing link was returned.');
    return url;
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

    /** Stripe Customer Portal URL for the caller's organization. */
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
