# Free beta

Shiftella is free while the owner has no business registration (IČO). One switch in the database controls it: `app_settings.free_beta` (migration `20261124190000_free_beta.sql`).

## While it is on
- Every organization gets **Business**: all features, no member or location limits. `org_plan()` returns `business`, so every server gate opens.
- Nothing can be bought:
  - `billing-checkout` and plan switches in `billing-change-plan` answer `409 FREE_BETA`;
  - cancelling or resuming an existing Stripe subscription still works.
- The app reads the switch through `billing_free_beta()`:
  - the Billing page shows "Free beta" and hides the plan cards;
  - the nav pill says "Beta";
  - no trial banner and no "plan ended" dialog;
  - the landing pricing shows a "free during the beta" banner and keeps the prices as a preview.
- Subscription rows are not touched. Trials of new organizations keep counting down in the background, but nobody sees them.

## Ending the beta
Once the IČO, invoices and live Stripe are ready:

1. Tell the customers in advance: an in-app announcement plus email.
2. Give every organization created during the beta a fresh trial, so nobody drops to Free on day one (SQL editor, both projects):
   ```sql
   UPDATE public.subscriptions
      SET trial_ends_at = now() + interval '30 days'
    WHERE source = 'trial' AND status = 'trialing' AND stripe_subscription_id IS NULL;
   ```
3. Turn the switch off:
   ```sql
   UPDATE public.app_settings SET free_beta = false, updated_at = now();
   ```
4. Turn it back on the same way if needed. The app picks up the change within about 10 minutes, or on reload.
