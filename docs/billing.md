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
- **Switch to Free** (Billing page, Free card) cancels a live subscription
  **at the end of the paid period** (or of the Stripe trial) — nothing is
  refunded or charged; until then the plan keeps working, and it can be
  resumed. When a paid subscription has ended, the org is on Free with the
  same rules as after the trial (see *Plan ended prompt*).
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

> **VAT:** the operator is **not VAT-registered** (neplátce DPH). Prices are final; keep `STRIPE_AUTOMATIC_TAX=false` and the UI says no VAT is added. If that changes, turn on Stripe Tax, set the secret to `true` (or remove it) and bring back the "excl. VAT" wording.

Turn on **Stripe Tax** (Settings → Tax), register your Czech VAT, and set the
origin address. Checkout runs with `automatic_tax` and collects the customer's
address and VAT id (`tax_id_collection`). Until Stripe Tax is set up you can
start Checkout without it by setting the secret `STRIPE_AUTOMATIC_TAX=false`.

## 3. Customer Portal

**Nothing to set up by hand.** `billing-portal` opens the portal with its own
configuration, which `ensurePortalConfiguration()` in
`supabase/functions/_shared/billing.ts` finds (an active configuration with
`metadata.shiftella = v2`) or creates on first use, so live mode configures
itself. It allows:

- update payment method, invoice history, billing details (email, address,
  name, tax id), **cancel** at period end;
- **no plan switching** (`subscription_update` disabled). Stripe carries the
  quantity over on a portal switch, so Business with 10 seats → Team offered
  "10 × 449 Kč". Plan and interval changes happen in the app instead (see
  *Plan changes* below).

The return URL is passed per session (`APP_URL/billing`). The Dashboard's
*default* portal configuration is no longer used; leave it as it is. To change
the portal's settings, bump the tag (`v2` → `v3`) in the helper so a fresh
configuration is created.

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

supabase functions deploy billing-checkout    --project-ref <project-ref>
supabase functions deploy billing-change-plan --project-ref <project-ref>
supabase functions deploy billing-portal      --project-ref <project-ref>
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
- Plan switch: on a live Business subscription, *Switch to Team* → the
  subscription shows Team × 1 in Stripe and a credit on the next invoice;
  *Switch to Business* back → Business × max(10, members), invoiced at once.
  *Manage billing* opens a portal without any plan-switch option.
- Switch to Free: on a live subscription, Free card → *Switch to Free* →
  confirm → Stripe shows "Cancels {date}"; the Billing page shows *Ends {date}*,
  *From {date}* on the Free card and *Resume subscription*. *Resume* → the
  cancel is gone in Stripe. To see the plan-ended prompt, cancel the
  subscription immediately in the Stripe Dashboard (or with a test clock
  advance past the period end): the webhook writes `status = canceled`, the
  next app open shows *Your subscription has ended* once.

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
  created/updated event (a safety net; plan switches already set the right
  quantity) and on `invoice.upcoming`. It skips orgs without a live Stripe subscription (trial,
  grandfathered, gifts) and never fails the member action. Invited people
  count from the invite (their profile exists from then).
  Proration: monthly plans put the difference on the next invoice; **yearly plans invoice extra seats immediately** (`always_invoice`) and leave a credit for fewer seats; at renewal (`invoice.upcoming`) the count is corrected without proration.

- **Plan changes** (Team ⇄ Business, monthly ⇄ yearly) for an org with a live
  Stripe subscription (`trialing` / `active` / `past_due`) happen **on the
  Billing page**, never in the portal: the other plan's card shows *Switch to
  {plan}*, the current plan's card shows *Switch to yearly / monthly* when the
  toggle differs, and one confirm shows the new price (Team flat; Business
  N × unit, min. 10) and whether it's charged now, credited, or free during
  the trial. The `billing-change-plan` function then updates the subscription
  item in place with the new price and the right quantity (Team 1, Business
  max(10, members)), clears `cancel_at_period_end`, sets
  `metadata.plan`, and writes the row (`syncFromStripe`).
  - **Proration** (`prorationForChange()` in `_shared/billing.ts`, mirrored by
    `changeKind()` in `src/features/billing/plans.ts`): an **upgrade**
    (Team → Business, or monthly → yearly) uses `always_invoice`, so the
    prorated difference is charged right away; a **downgrade** uses
    `create_prorations`, a credit on the next invoice; while **trialing**,
    `none`. Stripe resets the billing cycle on any interval change and
    invoices it at once; on yearly → monthly the unused year exceeds the new
    month, and the rest is kept as a customer credit balance.
  - **Refused:** no live subscription → 409 `NO_SUBSCRIPTION` (the app falls
    back to Checkout); gifts (`GRANTED`) and grandfathered orgs
    (`GRANDFATHERED`); to Team when the org doesn't fit, 409
    `PLAN_LIMIT_MEMBERS` (> 15 members) / `PLAN_LIMIT_LOCATIONS` (> 3 active
    locations). Same plan + interval → `{ ok: true, unchanged: true }`.
  - Native apps show no switch buttons (store rules, as for Checkout).
- **Switch to Free = cancel at period end.** The Free card shows *Switch to
  Free* for an org with a live Stripe subscription (`trialing` / `active` /
  `past_due`) that isn't already cancel-scheduled. One confirm says when it
  ends (`current_period_end`, which is the trial end while trialing), that
  everything works until then, and that afterwards the Free limits apply
  (5 people, 1 location) and anything above them becomes read-only — nothing
  is deleted; when the org is over those limits it lists today's counts.
  `billing-change-plan` with `{ plan: 'free' }` sets
  `cancel_at_period_end: true` (no proration, no charge), writes the row
  (`syncFromStripe`) and returns `{ ok: true, plan: 'free', endsAt }`; toast
  "Your subscription ends on {date}, then you move to Free." Same refusals as
  a switch (`GRANTED`, `GRANDFATHERED`, `NO_SUBSCRIPTION`); already scheduled
  → `{ ok: true, unchanged: true, endsAt }`. The portal's own *Cancel* does
  the same thing.
- **Resume.** While `cancel_at_period_end` is set, the status chip reads
  *Ends {date}*, the current plan shows *Ends on {date} — then you move to
  Free* with a *Resume subscription* button, and the Free card shows *From
  {date}* instead of its button. Resume calls `billing-change-plan` with
  `{ action: 'resume' }` → `cancel_at_period_end: false` (no charge, no
  confirm, toast "Subscription resumed."). Any plan / interval switch also
  clears a scheduled cancel (its confirm says so). Request parsing, refusals
  and the cancel flag are pure helpers in `_shared/billing.ts`
  (`parseChangeRequest`, `changeRefusal`, `cancelFlagTarget`, `endsAtOf`),
  tested by `_shared/billing_test.ts` (`deno test`, from a copy of
  `supabase/functions` outside the repo).
- **Plan ended prompt.** When a paid Stripe subscription has ended
  (`status = canceled`, effective plan Free, no active gift, not
  grandfathered — `planEnded` / `subscriptionEnded()` in `entitlements.ts`),
  the owner sees, on the web only and never on `/billing`, the same one-time
  dialog as after the trial (`PlanEndedDialog`, rules in `endedPrompt.ts`)
  titled *Your subscription has ended*: what Free keeps, what needs a paid
  plan, *Choose plan* → `/billing`, *Stay on Free*. It is remembered on the
  device per organization **and per ended subscription id**
  (`billing-plan-ended-seen:{org}:{sub}`), so a later subscription that ends
  asks again; opening `/billing` counts as seen. The banner says *Your
  subscription has ended — you are on Free now.* with *Choose plan*
  (dismissible for the day), the Billing page shows a *Subscription ended*
  chip, and the nav pill shows *Choose plan* as on any Free org. Native apps
  get only the banner, with "manage on the web" and no link.
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
