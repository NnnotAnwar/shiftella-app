// =============================================================================
// EDGE FUNCTION: billing-change-plan
// -----------------------------------------------------------------------------
// Changes the CALLER's organization's live Stripe subscription in place.
// Body (parseChangeRequest in _shared/billing.ts):
//   { plan: 'team' | 'business', interval: 'month' | 'year' } → switch plan / interval
//   { plan: 'free' }        → cancel at the end of the paid period (or trial)
//   { action: 'resume' }    → undo a scheduled cancel
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
//     invoice; while trialing nothing is prorated. A switch also clears a
//     scheduled cancel.
//   • An upgrade charged now is applied only once paid (payment_behavior
//     pending_if_incomplete): declined / 3-D Secure → 402 PAYMENT_REQUIRED
//     { url: the invoice to pay }; the plan stays as it was until then.
//   • Same plan + interval → 200 { ok: true, unchanged: true }.
//   • To Free: cancel_at_period_end = true → 200 { ok: true, plan: 'free',
//     endsAt }. The plan keeps running until endsAt; then Stripe cancels the
//     subscription and the webhook drops the org to Free (nothing is deleted).
//   • Resume: cancel_at_period_end = false → 200 { ok: true, resumed: true }.
//     Neither charges anything. Already so → { ok: true, unchanged: true }.
//
// Deploy: supabase functions deploy billing-change-plan
// =============================================================================

import {
    LIVE_STATUSES,
    TEAM_MAX_LOCATIONS,
    TEAM_MAX_MEMBERS,
    cancelFlagTarget,
    changeRefusal,
    corsHeaders,
    endsAtOf,
    json,
    loadSubscription,
    parseChangeRequest,
    paymentBehaviorFor,
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

        const request = parseChangeRequest(await req.json().catch(() => ({})));
        if (!request) {
            return json({ error: 'Pick a plan (free / team / business) and a billing interval (month / year), or { action: "resume" }.' }, 400);
        }

        const row = await loadSubscription(admin, organizationId);
        const refusal = changeRefusal(row);
        if (refusal || !row?.stripe_subscription_id) return json(refusal ?? { error: 'No subscription.', code: 'NO_SUBSCRIPTION' }, 409);

        // Re-read from Stripe: the row can lag a webhook behind.
        const stripe = await stripeClient();
        const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        const item = sub.items.data[0];
        if (!item || !LIVE_STATUSES.includes(sub.status)) {
            return json({ error: 'There is no active subscription to change — pick a plan first.', code: 'NO_SUBSCRIPTION' }, 409);
        }

        // To Free / resume: only the cancel flag moves — no charge, no proration.
        if (request.kind === 'cancel' || request.kind === 'resume') {
            const target = cancelFlagTarget(request.kind, sub.cancel_at_period_end);
            const result = request.kind === 'cancel' ? { plan: 'free' as const } : { resumed: true };
            if (target === null) return json({ ok: true, unchanged: true, ...result, endsAt: sub.cancel_at_period_end ? endsAtOf(sub) : null }, 200);
            const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: target });
            await syncFromStripe(admin, sub.id, organizationId);
            return json({ ok: true, ...result, endsAt: target ? endsAtOf(updated) : null }, 200);
        }

        const { plan, interval } = request;
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
        const payment_behavior = paymentBehaviorFor(proration_behavior);
        const strict = payment_behavior === 'pending_if_incomplete';
        const flags = { cancel_at_period_end: false, metadata: { organization_id: organizationId, plan } };
        // A pending_if_incomplete update accepts only items / proration fields, so the
        // flags follow in a second call — and only once the upgrade has gone through.
        const updated = await stripe.subscriptions.update(sub.id, {
            items: [{ id: item.id, price: priceFor(plan, interval), quantity }],
            proration_behavior,
            payment_behavior,
            expand: ['latest_invoice'],
            ...(strict ? {} : flags),
        });
        if (updated.pending_update) {
            // Not paid (declined / needs 3-D Secure): the plan stays as it was. Stripe
            // applies the change by itself if this invoice is paid within 23 hours.
            const invoice = updated.latest_invoice;
            const url = invoice && typeof invoice === 'object' ? invoice.hosted_invoice_url ?? null : null;
            return json(
                {
                    error: 'The payment did not go through, so your plan has not changed yet. Pay the invoice to finish the upgrade.',
                    code: 'PAYMENT_REQUIRED',
                    url,
                },
                402,
            );
        }
        if (strict) await stripe.subscriptions.update(sub.id, flags);

        // Write the row now (the webhook will confirm it a moment later).
        await syncFromStripe(admin, sub.id, organizationId);

        return json({ ok: true, plan, interval }, 200);
    } catch (err) {
        const message = err instanceof Error ? err.message : JSON.stringify(err);
        console.error('[billing-change-plan]', message);
        return json({ error: message || 'Unexpected error.' }, 500);
    }
});
