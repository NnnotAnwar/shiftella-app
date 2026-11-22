// =============================================================================
// EDGE FUNCTION: stripe-webhook
// -----------------------------------------------------------------------------
// Receives Stripe events, verifies the signature (STRIPE_WEBHOOK_SECRET) and
// mirrors the subscription onto public.subscriptions (service role).
//
// Events:
//   checkout.session.completed          → the new subscription
//   customer.subscription.created       → upsert
//   customer.subscription.updated       → upsert (plan / interval / status /
//                                          cancel_at_period_end / seats)
//   customer.subscription.deleted       → status canceled → org falls to Free
//   invoice.payment_failed              → status past_due (grace while Stripe retries)
//   invoice.upcoming                    → safety net: re-sync the Business seat
//                                          count before the renewal invoice
//
// Every handler re-reads the subscription from Stripe (events can arrive out of
// order). The manual_* grant columns are never written here, so an active
// Superadmin grant keeps the org on its granted plan whatever Stripe says.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// (Stripe calls it without a Supabase JWT; the signature is the auth.)
// =============================================================================

import type Stripe from 'npm:stripe@17.7.0';
import { json, serviceClient, stripeClient, subtleCryptoProvider, syncFromStripe, syncSeats } from '../_shared/billing.ts';

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null);

Deno.serve(async (req) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    const signature = req.headers.get('stripe-signature');
    if (!secret) return json({ error: 'STRIPE_WEBHOOK_SECRET is not set.' }, 500);
    if (!signature) return json({ error: 'Missing stripe-signature header.' }, 400);

    let event: Stripe.Event;
    try {
        const stripe = await stripeClient();
        const body = await req.text();
        event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, await subtleCryptoProvider());
    } catch (err) {
        console.warn('[stripe-webhook] bad signature', err instanceof Error ? err.message : err);
        return json({ error: 'Invalid signature.' }, 400);
    }

    const admin = serviceClient();
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const subId = idOf(session.subscription as string | Stripe.Subscription | null);
                if (session.mode === 'subscription' && subId) {
                    await syncFromStripe(admin, subId, session.client_reference_id ?? session.metadata?.organization_id ?? null);
                }
                break;
            }
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const sub = event.data.object as Stripe.Subscription;
                const orgId = await syncFromStripe(admin, sub.id, sub.metadata?.organization_id ?? null);
                // A plan switch in the Portal keeps the old quantity: Team must
                // bill 1, Business the member count (min. 10).
                if (event.type !== 'customer.subscription.deleted') await syncSeats(admin, orgId);
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                const subId = idOf(invoice.subscription as string | Stripe.Subscription | null);
                if (subId) await syncFromStripe(admin, subId);
                break;
            }
            case 'invoice.upcoming': {
                const invoice = event.data.object as Stripe.Invoice;
                const subId = idOf(invoice.subscription as string | Stripe.Subscription | null);
                if (subId) {
                    const orgId = await syncFromStripe(admin, subId);
                    // At renewal: no mid-cycle proration, just bill the right count.
                    await syncSeats(admin, orgId, { prorate: false });
                }
                break;
            }
            default:
                // Not ours to handle — acknowledge so Stripe doesn't retry.
                break;
        }
        return json({ received: true }, 200);
    } catch (err) {
        // 500 → Stripe retries with backoff, which is what we want for transient errors.
        const message = err instanceof Error ? err.message : JSON.stringify(err);
        console.error('[stripe-webhook]', event.type, message);
        return json({ error: message }, 500);
    }
});
