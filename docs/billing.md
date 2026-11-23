# Billing (Stripe) — setup guide

Shiftella bills **per organization**. One row in `public.subscriptions` per org
holds its plan; Stripe is the source of truth for paid plans and a webhook
mirrors it into the database. Nothing here is live until you do the steps below.

## Plans

| Plan | Price (excl. VAT) | Limits | Adds |
|---|---|---|---|
| **Free** | 0 Kč | 5 members · 1 active location | Core: clock in/out, rota, requests, announcements, availability |
| **Team** | **449 Kč / €17.90 per month, flat** for the whole org · yearly **359 Kč / €14.30 per month** (billed 4 308 Kč / €171.60 a year) | **15 members · 3 active locations** | Timesheets + PDF/XLSX exports, shift swaps & open shifts, templates / copy month, push notifications, wages, custom roles |
| **Business** | **45 Kč / €1.80 per member / month** · yearly **36 Kč / €1.45** (billed 432 Kč / €17.40 per member a year) · **minimum 10 members billed** | Unlimited | Everything in Team + activity log, coverage requirements & rest-rule warnings, priority support, early access |

- **Trial:** every new organization gets **30 days of Business**, no card.
  Afterwards it falls back to Free: nothing is deleted; whatever is above the
  Free limits stays but becomes read-only (no new members / locations, gated
  pages show an upgrade prompt).
- **Existing organizations** (at migration time) are **grandfathered**:
  Business, forever, free (`source = 'grandfathered'`).
- **Gifts:** the Superadmin can grant any org Team or Business for free, until a
  date or forever (Team → Organizations → edit an org → *Plan (free grant)*).
  An active gift wins over everything, Stripe included; the webhook never
  touches it. Choosing *Free* there removes the gift.
- **Superadmin** bypasses every gate and limit.
- Limits are enforced **in the database** (triggers on `profiles` and
  `locations`), not only in the UI. The invite function returns a clear
  `PLAN_LIMIT_MEMBERS` (402) message before even trying.

## 1. Stripe products and prices

Create everything in **test mode** first, then repeat in live mode.

Create two products, **Shiftella Team** and **Shiftella Business**, and four
recurring prices. Each price is in **CZK** with an **EUR currency option**
(Price → *Add more currencies*), so Checkout shows EUR to customers outside CZ.
Set **Tax behavior = Exclusive** on every price (prices are excl. VAT).

| Env var | Product | Pricing model | CZK | EUR | Interval |
|---|---|---|---|---|---|
| `STRIPE_PRICE_TEAM_MONTH` | Team | **Flat rate** (standard, quantity 1) | 449.00 | 17.90 | monthly |
| `STRIPE_PRICE_TEAM_YEAR` | Team | **Flat rate** (standard, quantity 1) | 4 308.00 | 171.60 | yearly |
| `STRIPE_PRICE_BUSINESS_MONTH` | Business | **Per unit** (per member) | 45.00 | 1.80 | monthly |
| `STRIPE_PRICE_BUSINESS_YEAR` | Business | **Per unit** (per member) | 432.00 | 17.40 | yearly |

Optional but handy: add metadata `plan=team` / `plan=business` on each price
(the webhook falls back to it if a price id isn't in the secrets).

**Quantities:** the app always sends Team with quantity **1**; Business with
quantity **= members in the org, minimum 10**. The Business quantity follows
the team automatically (see *Seat sync*).

## 2. Tax / VAT

Turn on **Stripe Tax** (Settings → Tax), register your Czech VAT, and set the
origin address. Checkout runs with `automatic_tax` and collects the customer's
address and VAT id (`tax_id_collection`). Until Stripe Tax is set up you can
start Checkout without it by setting the secret `STRIPE_AUTOMATIC_TAX=false`.

## 3. Customer Portal

Settings → Billing → **Customer portal**:

- Allow: update payment method, view invoices, update billing info / tax id,
  **cancel** (at period end).
- **Switch plans:** allow switching between the 4 prices above (Team ⇄
  Business, monthly ⇄ yearly). **Do not allow customers to change the
  quantity** — the app keeps it right (Team 1, Business = members, min. 10) and
  fixes it after any switch.
- Set the default return URL to `https://<your-app>/billing`.

## 4. Webhook

Developers → Webhooks → **Add endpoint**:

- URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `invoice.upcoming` (safety net: re-syncs the Business quantity before renewal)
- Copy the **signing secret** (`whsec_…`) for the next step.

## 5. Secrets

```sh
supabase secrets set --project-ref <project-ref> \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_TEAM_MONTH=price_... \
  STRIPE_PRICE_TEAM_YEAR=price_... \
  STRIPE_PRICE_BUSINESS_MONTH=price_... \
  STRIPE_PRICE_BUSINESS_YEAR=price_... \
  APP_URL=https://shiftella.app
# optional, until Stripe Tax is configured:
# supabase secrets set --project-ref <project-ref> STRIPE_AUTOMATIC_TAX=false
```

`APP_URL` is where Checkout / the Portal send people back (`/billing`); use the
preprod URL on preprod. Never commit any of these values.

## 6. Database + functions

```sh
# the migration: subscriptions table, org_plan(), limits, trial seed,
# grandfathering backfill, gifts (admin_set_org_plan / admin_clear_org_plan)
supabase db push --project-ref <project-ref>        # or apply 20261121120000_billing_subscriptions.sql

supabase functions deploy billing-checkout --project-ref <project-ref>
supabase functions deploy billing-portal   --project-ref <project-ref>
supabase functions deploy stripe-webhook   --project-ref <project-ref> --no-verify-jwt
# these changed too (limit check, seat sync, push gated to Team+):
supabase functions deploy invite-employee delete-employee delete-account --project-ref <project-ref>
supabase functions deploy send-push --project-ref <project-ref> --no-verify-jwt
```

Check it: `psql "$PREPROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing_smoke.sql`
(runs in a transaction that is rolled back; ends with `BILLING SMOKE OK`).

> Order matters on prod: run the migration **before** the first new
> organization signs up, otherwise the backfill grandfathers it too (harmless,
> but it wouldn't get a trial — it would get Business forever).

## 7. Test

- Card `4242 4242 4242 4242`, any future date, any CVC. Declines:
  `4000 0000 0000 0341` (attaches, then fails on renewal → `past_due`).
- As a Head Admin on web: Billing → pick Team or Business → Checkout → back on
  `/billing?checkout=success`; the page polls until the webhook has written the
  row.
- Local webhook testing: `stripe listen --forward-to
  http://127.0.0.1:54321/functions/v1/stripe-webhook` and use the `whsec_` it
  prints as `STRIPE_WEBHOOK_SECRET` (`supabase functions serve --env-file …`).
- Trigger a renewal/seat check: `stripe trigger invoice.upcoming`.

## How it works (for maintainers)

- **Effective plan** = `org_plan(org)` in SQL, `effectivePlan()` in
  `src/features/billing/entitlements.ts` (keep them in step): active gift →
  its plan; no-card trial past `trial_ends_at` → free; `trialing` / `active` /
  `past_due` → the plan (past_due = grace while Stripe retries); `canceled` /
  `incomplete` → free.
- **Who can pay:** the org's Head Admin (and Superadmin) —
  `has_permission('billing', 'write')`, which only rank ≥ 40 passes today.
- **Seat sync** (Business only, Team is held at 1): `syncSeats()` in
  `supabase/functions/_shared/billing.ts` runs after `invite-employee`,
  `delete-employee` and `delete-account`, after every subscription
  created/updated event (fixes the quantity after a Portal plan switch) and on
  `invoice.upcoming`. It skips orgs without a live Stripe subscription (trial,
  grandfathered, gifts) and never fails the member action. Invited people
  count from the invite (their profile exists from then).
  Proration: monthly plans put the difference on the next invoice; **yearly plans invoice extra seats immediately** (`always_invoice`) and leave a credit for fewer seats; at renewal (`invoice.upcoming`) the count is corrected without proration.

- **Trial carry-over:** upgrading with more than 2 days of the trial left sets
  Stripe's `trial_end` to the trial's end, so nothing is charged before it.
- **Activity log:** `plan_changed` (plan / status / interval / cancel at period
  end), `plan_granted`, `plan_grant_removed`.
- **Push notifications** are Team+: `send-push` skips Free orgs (the in-app
  bell still works).

## Native apps (App Store / Google Play)

In the iOS / Android app (`Capacitor.isNativePlatform()`) the Billing page shows
**only the plan status** — no prices, no upgrade buttons, no links to an
external purchase — plus the neutral line "Manage your subscription in
Shiftella on the web." Upgrade prompts inside gated pages follow the same rule.
This keeps the apps within Apple's / Google's rules on digital purchases
outside the store (the "reader"-style approach: the account is bought on the
web). Don't add a link or a price to the native UI without checking the
current store guidelines first.
