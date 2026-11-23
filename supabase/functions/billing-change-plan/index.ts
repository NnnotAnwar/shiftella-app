// =============================================================================
// EDGE FUNCTION: billing-change-plan
// -----------------------------------------------------------------------------
// Switches the CALLER's organization's live Stripe subscription to another plan
// and/or billing interval, in place. Body: { plan: 'team' | 'business',
// interval: 'month' | 'year' }
//
// Authorization (from the JWT, never the body): Superadmin or the org's Head
// Admin (has_permission('billing', 'write')) — same as billing-checkout.
//
// Why not the Customer Portal: Stripe carries the quantity over on a portal
// switch, so Business (10 seats) → Team offered "10 × 449 Kč". Here the
// quantity is always right — Team 1, Business max(10, members).
//
//   • Needs a live subscription (trialing / active / past_due); otherwise 409
//     NO_SUBSCRIPTION and the client starts Checkout instead.
//   • Refused (409) for gifts (GRANTED) and grandfathered orgs (GRANDFATHERED).
//   • To Team: the org must fit (≤ 15 members, ≤ 3 active locations), else 409
//     PLAN_LIMIT_MEMBERS / PLAN_LIMIT_LOCATIONS.
//   • Proration (prorationForChange): upgrade (Team → Business, monthly →
//     yearly) is invoiced now; a downgrade leaves a credit for the next
//     invoice; while trialing nothing is prorated.
//   • Same plan + interval → 200 { ok: true, unchanged: true }.
//
// Deploy: supabase functions deploy billing-change-plan
// =============================================================================

import {
    LIVE_STATUSES,
    TEAM_MAX_LOCATIONS,
    TEAM_MAX_MEMBERS,
    corsHeaders,
    hasActiveGrant,
    json,
    loadSubscription,
    planForPrice,
    priceFor,
    prorationForChange,
    quantityFor,
    requireBillingCaller,
    stripeClient,
    syncFromStripe,
    type Interval,
    type PaidPlan,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

    try {
        const caller = await requireBillingCaller(req);
        if (caller instanceof Response) return caller;
        const { admin, organizationId } = caller;

        const body = await req.json().catch(() => ({}));
        const plan = body.plan === 'team' || body.plan === 'business' ? (body.plan as PaidPlan) : null;
        const interval: Interval | null = body.interval === 'year' ? 'year' : body.interval === 'month' ? 'month' : null;
        if (!plan || !interval) return json({ error: 'Pick a plan (team / business) and a billing interval (month / year).' }, 400);

        const row = await loadSubscription(admin, organizationId);
        if (hasActiveGrant(row)) return json({ error: 'Your plan was granted by Shiftella — nothing to pay.', code: 'GRANTED' }, 409);
        if (row?.source === 'grandfathered') return json({ error: 'Your organization already has Business for free.', code: 'GRANDFATHERED' }, 409);
        if (!row?.stripe_subscription_id || !LIVE_STATUSES.includes(row.status)) {
            return json({ error: 'There is no active subscription to change — pick a plan first.', code: 'NO_SUBSCRIPTION' }, 409);
        }

        // Re-read from Stripe: the row can lag a webhook behind.
        const stripe = await stripeClient();
        const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        const item = sub.items.data[0];
        if (!item || !LIVE_STATUSES.includes(sub.status)) {
            return json({ error: 'There is no active subscription to change — pick a plan first.', code: 'NO_SUBSCRIPTION' }, 409);
        }
        const from = planForPrice(item.price?.id) ?? {
            plan: (row.plan === 'team' ? 'team' : 'business') as PaidPlan,
            interval: (row.interval === 'year' ? 'year' : 'month') as Interval,
        };

        if (from.plan === plan && from.interval === interval) return json({ ok: true, unchanged: true, plan, interval }, 200);

        const { data: memberCount, error: memberErr } = await admin.rpc('org_member_count', { p_org: organizationId });
        if (memberErr) throw new Error(`Could not count members: ${memberErr.message}`);
        const members = Number(memberCount ?? 0);
        const quantity = quantityFor(plan, members);

        // Team must fit before we move the org onto it.
        if (plan === 'team') {
            if (members > TEAM_MAX_MEMBERS) {
                return json(
                    {
                        error: `Team allows up to ${TEAM_MAX_MEMBERS} people — your organization has ${members}. Remove people first, or stay on Business.`,
                        code: 'PLAN_LIMIT_MEMBERS',
                        limit: TEAM_MAX_MEMBERS,
                        count: members,
                    },
                    409,
                );
            }
            // org_active_location_count has no explicit service_role grant (billing migration) — count directly.
            const { count: locations, error: locErr } = await admin
                .from('locations')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', organizationId)
                .is('archived_at', null);
            if (locErr) throw new Error(`Could not count locations: ${locErr.message}`);
            if ((locations ?? 0) > TEAM_MAX_LOCATIONS) {
                return json(
                    {
                        error: `Team allows up to ${TEAM_MAX_LOCATIONS} active locations — your organization has ${locations}. Archive some first, or stay on Business.`,
                        code: 'PLAN_LIMIT_LOCATIONS',
                        limit: TEAM_MAX_LOCATIONS,
                        count: locations,
                    },
                    409,
                );
            }
        }

        const proration_behavior = prorationForChange(from, { plan, interval }, sub.status);
        await stripe.subscriptions.update(sub.id, {
            items: [{ id: item.id, price: priceFor(plan, interval), quantity }],
            cancel_at_period_end: false,
            metadata: { organization_id: organizationId, plan },
            proration_behavior,
        });

        // Write the row now (the webhook will confirm it a moment later).
        await syncFromStripe(admin, sub.id, organizationId);

        return json({ ok: true, plan, interval }, 200);
    } catch (err) {
        const message = err instanceof Error ? err.message : JSON.stringify(err);
        console.error('[billing-change-plan]', message);
        return json({ error: message || 'Unexpected error.' }, 500);
    }
});
