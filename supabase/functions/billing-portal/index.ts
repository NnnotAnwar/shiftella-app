// =============================================================================
// EDGE FUNCTION: billing-portal
// -----------------------------------------------------------------------------
// Opens the Stripe Customer Portal for the CALLER's organization (change plan
// or interval, update the card, invoices, cancel). Same authorization as
// billing-checkout: Superadmin or the org's Head Admin.
//
// Deploy: supabase functions deploy billing-portal
// =============================================================================

import { appUrl, corsHeaders, json, loadSubscription, requireBillingCaller, stripeClient } from '../_shared/billing.ts';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

    try {
        const caller = await requireBillingCaller(req);
        if (caller instanceof Response) return caller;

        const body = await req.json().catch(() => ({}));
        const row = await loadSubscription(caller.admin, caller.organizationId);
        if (!row?.stripe_customer_id) return json({ error: 'There is no billing account yet — pick a plan first.', code: 'NO_CUSTOMER' }, 400);

        const stripe = await stripeClient();
        const session = await stripe.billingPortal.sessions.create({
            customer: row.stripe_customer_id,
            return_url: `${appUrl()}/billing`,
            locale: body.language === 'cs' ? 'cs' : 'en',
        });
        return json({ url: session.url }, 200);
    } catch (err) {
        const message = err instanceof Error ? err.message : JSON.stringify(err);
        console.error('[billing-portal]', message);
        return json({ error: message || 'Unexpected error.' }, 500);
    }
});
