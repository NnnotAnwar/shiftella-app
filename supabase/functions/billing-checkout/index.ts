// =============================================================================
// EDGE FUNCTION: billing-checkout
// -----------------------------------------------------------------------------
// Starts a Stripe Checkout Session for the CALLER's organization.
// Body: { plan: 'team' | 'business', interval: 'month' | 'year', language? }
//
// Authorization (from the JWT, never the body): Superadmin or the org's Head
// Admin (has_permission('billing', 'write')).
//
//   • Team      — flat price, quantity 1 (hard limit 15 members / 3 locations).
//   • Business  — per member, quantity = members (minimum 10).
//   • Days left on the no-card trial carry over (Stripe trial_end) when more
//     than 2 days remain, so upgrading early never costs trial days.
//   • Refused (409) when the org already has a live Stripe subscription (plan
//     changes go through the Customer Portal), is grandfathered, or has an
//     active Superadmin grant.
//
// Deploy: supabase functions deploy billing-checkout
// =============================================================================

import {
    appUrl,
    hasActiveGrant,
    json,
    corsHeaders,
    loadSubscription,
    priceFor,
    quantityFor,
    requireBillingCaller,
    stripeClient,
    type Interval,
    type PaidPlan,
} from '../_shared/billing.ts';

const DAY = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

    try {
        const caller = await requireBillingCaller(req);
        if (caller instanceof Response) return caller;
        const { admin, organizationId, email } = caller;

        const body = await req.json().catch(() => ({}));
        const plan = body.plan === 'team' || body.plan === 'business' ? (body.plan as PaidPlan) : null;
        const interval = body.interval === 'year' ? 'year' : body.interval === 'month' ? 'month' : null;
        if (!plan || !interval) return json({ error: 'Pick a plan (team / business) and a billing interval (month / year).' }, 400);
        const language = body.language === 'cs' ? 'cs' : 'en';

        const row = await loadSubscription(admin, organizationId);
        if (hasActiveGrant(row)) return json({ error: 'Your plan was granted by Shiftella — nothing to pay.', code: 'GRANTED' }, 409);
        if (row?.source === 'grandfathered') return json({ error: 'Your organization already has Business for free.', code: 'GRANDFATHERED' }, 409);
        if (row?.stripe_subscription_id && ['trialing', 'active', 'past_due'].includes(row.status)) {
            return json({ error: 'You already have a subscription — change it under Manage billing.', code: 'HAS_SUBSCRIPTION' }, 409);
        }

        const stripe = await stripeClient();
        const base = appUrl();

        // One Stripe customer per organization.
        let customerId = row?.stripe_customer_id ?? null;
        if (!customerId) {
            const { data: org } = await admin.from('organizations').select('name').eq('id', organizationId).single();
            const customer = await stripe.customers.create({
                name: org?.name ?? undefined,
                email: email ?? undefined,
                preferred_locales: [language],
                metadata: { organization_id: organizationId },
            });
            customerId = customer.id;
            const { error } = await admin
                .from('subscriptions')
                .upsert({ organization_id: organizationId, stripe_customer_id: customerId }, { onConflict: 'organization_id' });
            if (error) return json({ error: 'Could not prepare billing.' }, 500);
        }

        const { data: members } = await admin.rpc('org_member_count', { p_org: organizationId });
        const quantity = quantityFor(plan, Number(members ?? 0));

        // Carry over the rest of the no-card trial.
        const trialEnd =
            row?.source === 'trial' && row.status === 'trialing' && row.trial_ends_at && new Date(row.trial_ends_at).getTime() - Date.now() > 2 * DAY
                ? Math.floor(new Date(row.trial_ends_at).getTime() / 1000)
                : undefined;

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            client_reference_id: organizationId,
            line_items: [{ price: priceFor(plan, interval as Interval), quantity }],
            subscription_data: {
                metadata: { organization_id: organizationId, plan },
                ...(trialEnd ? { trial_end: trialEnd } : {}),
            },
            metadata: { organization_id: organizationId, plan, interval },
            automatic_tax: { enabled: Deno.env.get('STRIPE_AUTOMATIC_TAX') !== 'false' },
            customer_update: { address: 'auto', name: 'auto' },
            tax_id_collection: { enabled: true },
            allow_promotion_codes: true,
            locale: language,
            success_url: `${base}/billing?checkout=success`,
            cancel_url: `${base}/billing?checkout=canceled`,
        });

        return json({ url: session.url }, 200);
    } catch (err) {
        const message = err instanceof Error ? err.message : JSON.stringify(err);
        console.error('[billing-checkout]', message);
        return json({ error: message || 'Unexpected error.' }, 500);
    }
});
