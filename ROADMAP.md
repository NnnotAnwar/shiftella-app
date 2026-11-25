# Roadmap

Living plan for **Shiftella**. Direction, not commitments — dates and scope
change. Concrete work is tracked as **GitHub Issues** grouped into **Milestones**;
this file is the high-level story, plus a large **idea backlog** to draw from.

_Last updated: November 25, 2026 · current version 1.14.10 “Frýdlant”._

---

## ✅ Shipped (recent highlights)

- **v1.14 “Frýdlant”** (1.14.0 – 1.14.10) — **leave**: 12 absence kinds, part-day
  requests, vacation balance in hours and a **náhradní volno** bank for holiday
  work; **shift notes & handover** for the next person; **rota cost** in the
  grid before publishing; **payroll export** (Excel / CSV / Money S3 XML) with
  personal numbers; **owner analytics** (Business); **employee documents** with
  expiry reminders; **shift reminders**, a **morning digest** for managers,
  **targeted announcements** with read receipts and a **setup checklist**;
  **help centre** and **in-app feedback**; **Slovak and Ukrainian**.
  Patches: a security pass (server-time clock-in, sign-in rate limit, locked-down
  push function, 8-character passwords), a new privacy policy, the **enforced
  CSP**, self-hosted fonts, an **in-browser demo** at `/demo/` (the full app on
  a sample café, nothing stored), polished layouts and motion on phones and
  tablets.
- **v1.13.0 “Ejpovice”** — **Telegram bot** (link from Settings with a one-time
  code; English commands with a button menu: shifts week by week with
  confirm, today, hours month by month, announcements, approve / decline
  requests; a copy of every push; never clock-in); **calendar subscription**
  (ICS feed for Google / Apple / Outlook); **import members from Excel / CSV**;
  **public landing page** with pricing, FAQ and Czech SEO; paid features
  enforced in the database too; Superadmin can invite past a plan's limit;
  translated server errors; plan upgrades apply only once paid.
- **v1.12.0 “Děčín”** — rebrand to **Shiftella** (new name, S logo, app id
  `com.shiftella.app`, domain **shiftella.app**); **subscriptions** with Stripe —
  Free (≤ 5 people, 1 location), Team (flat 449 Kč/month, ≤ 15 people,
  3 locations), Business (45 Kč per person, from 10), 30-day Business trial,
  existing organizations grandfathered, plan gifts by the platform owner, limits
  enforced in the database; **forgot / reset password**, unconfirmed-email resend,
  CS/EN switch and field hints on the sign-in pages; hosting moved to **Hetzner**
  (shared edge Caddy, atomic deploys with rollback).
- **v1.11.0 “Cheb”** — **owner sign-up** (create your organization); **custom
  roles**, Discord-style (view / change / delete per area, order = hierarchy,
  hand out only what you hold, a default Employee role for everyone); **shift
  swaps** (offer → take → approve); **role / other requests and complaints**
  (optionally anonymous) in the Requests inbox; **four-eyes** decisions (nobody
  approves their own request); location opening hours drive the grid; Czech
  rest-rule warnings (11 h rest, > 6 days in a row); the **Activity Log records
  every action** with group filters; 136 tests + an RLS smoke test.
- **v1.10.0 “Beroun”** — glass redesign across every page; **roles: admins act,
  managers observe** (Supervisor is a badge); **Requests** is the shared inbox
  (time off + name changes, decline with a reason, history, my requests);
  announcements with push + unread badge; shift confirmations (select all →
  confirm, auto-reset when a shift changes); public-holiday warnings;
  availability; coverage targets; open shifts (claim / give back); shift
  templates (max 8) with a grid brush and one-tap delete + Undo; admin-only
  wages; location opening hours; Overview month plan + pace chart; role-aware
  mobile tab bar.
- **Scheduling / rota (v1.9.0)** — roster grid + month calendar per location,
  day editor with per-member times & busy-locking (DB no-overlap), per-location
  staff rosters, restaurant short/long-week quick-fill, copy last month,
  draft→publish, location letters + Σ hours, time off (vacation/sick/other) with
  approvals that clear the rota, late-for-shift alerts (+15 min / +1 h),
  exports that mirror the on-screen view, next-shift dashboard card.
- **Notifications** — in-app bell + **push (FCM)**; schedule + time-off events;
  **per-recipient localized push** (EN/CS); per-category preferences; deep-link
  on tap; everything logged to the Activity Log.
- **Foundations** — role hierarchy + org isolation enforced in RLS, invite &
  provisioning flow, realtime board with auto-reconnect, midnight auto-end.
- **Timesheets & exports** — admin shift management, per-employee & team exports
  (PDF / Excel / CSV) with native share, **Czech-correct PDF fonts**, Activity Log.
- **Localization & theming** — English / Čeština / Slovenčina / Українська,
  12h/24h, locale-aware dates, five colour schemes + light/dark/system.
- **Navigation & mobile** — ⌘K command palette, collapsible icon-rail sidebar,
  searchable location picker, pull-to-refresh, haptics, offline awareness,
  hardware-back handling, control-center “More” menu.
- **Auth & security** — biometric app lock (admin opt-in), consolidated RLS
  policies, trigger-only functions locked out of the REST API.

---

## 🔭 Next — approved plan (owner, 24 November 2026)

Approved by the owner after v1.12.0 “Děčín” shipped. ✅ = shipped (in v1.13
“Ejpovice” or v1.14 “Frýdlant”).
Deliberately left out: DPP/DPČ hour-cap tracking, because it could put off
customers.

### 1. Legal & money (first)
- **Czech-compliant Stripe invoices** — “Nejsem plátce DPH”, IČO and address in
  the invoice template (the operator is not VAT-registered).
- **Data processing agreement (DPA / zpracovatelská smlouva)** for business
  customers, plus terms for the paid service (payment, refunds, cancellation).
- ✅ **Stricter failed payments** — an upgrade takes effect only after the payment
  succeeds (`payment_behavior: pending_if_incomplete`).
- **Trial & billing emails** — trial day 1 / 20 / 27, “trial ended”, failed-payment
  (dunning) emails.

### 2. Fixes & tech debt
- ✅ **Server-side plan gates** — templates, swaps, wages and coverage are gated in
  the UI only; enforce them in RLS / the server, too.
- ✅ **Live-board role badges** show the base role in English (MANAGER, EMPLOYEE) in
  the Czech UI → show the organization's role name.
- ✅ **Translate server errors** (e.g. “There is no active subscription…”).
- ✅ **Superadmin can't invite into an org at its member limit** — allow it.
- ✅ **Redeploy the remaining functions** with billing (`delete-account`, plan-aware
  `send-push`; push currently reaches Free orgs too).
- **Database security** — ✅ #99 lock down SECURITY DEFINER helpers, ✅ #98
  unused / missing indexes, ✅ explicit function grants (docs/db-security.md);
  still open: stop `org_plan()` revealing other orgs' plans.
- ✅ **Security pass** (external review) — clock-in / out stamped by the server,
  sign-in rate limit, `send-push` accepts only our webhooks, 8-character
  passwords.
- ✅ **E2E tests** (Playwright): sign-in, sign-up, invite, free-beta billing — in CI
  against the fake backend under the enforced CSP; optional read-only suite
  against preprod (docs/e2e.md). Checkout waits for paid plans.
- ✅ **Uptime alerts** — GitHub Actions every 5 min → Telegram on state change
  (docs/uptime.md).
- **Infrastructure** — ✅ enforce the prod CSP, ✅ self-hosted fonts, ✅ Node 22,
  ✅ local Supabase CLI 3.x; still open: deploy on push, retire Vercel (and the
  Vercel↔Supabase integration).

### 3. Features
- **Auto-scheduling** — suggest a rota from availability, 11 h rest, hour
  targets and coverage needs; the manager edits and publishes.
- ✅ **Calendar sync** — your shifts as an ICS feed (Google / Apple Calendar).
- ✅ **Reminders** — push an hour before a shift, “you haven't clocked in”, a
  07:00 manager digest.
- **Trusted clock-in** — kiosk mode (tablet + PIN / QR), geofence check, breaks.
- ✅ **Rota cost** — wages and overtime visible in the grid before publishing.
- ✅ **Payroll exports** for Czech accounting — Money S3 XML import; POHODA has no
  attendance import, so its accountants use the Excel (docs/payroll-export.md).
- ✅ **Employee documents** — contracts, health certificates with expiry reminders.
- ✅ **Shift notes & handover** for the next person.
- ✅ **Targeted announcements** (per location / role) with read receipts.
- ✅ **More languages** — Slovak, Ukrainian; Polish later.
- ✅ **Import employees** from Excel / CSV.
- ✅ **Owner analytics** — labour cost share, absences, lateness, busy days
  (Business plan).

### 4. Growth
- ✅ **Landing page on shiftella.app** — product, pricing, FAQ, Czech SEO
  (“plánování směn”, “docházka zaměstnanců”).
- ✅ **Demo** — done as an **in-browser demo** at `/demo/` on the
  `tools/screenshots` fake backend: nothing stored, wiped when the tab closes.
- **Promo video** redone on the real UI (screenshot harness + the existing voice-over).
- **Store release** — Firebase for `com.shiftella.app`, #89 iOS push, Google /
  Apple sign-in, store listings.
- **Promo codes & referrals** (“bring a friend — a month free”; Stripe promotion
  codes are already enabled).
- **Discounts** — non-profits, yearly plans with 30+ people.
- ✅ **In-app feedback** and ✅ a **help centre**; a status page is still open.

### 5. Reliability
- **Error tracking** (e.g. Sentry); ✅ the uptime check with Telegram alerts is live.
- **Backup restore drill** for the Supabase database once a quarter.

---

## 💡 Idea backlog

Drafts to pull from — not commitments. Rough **value (V)** and **effort (E)** on a
1–5 scale to help triage. Grouped by theme.

### A. Scheduling depth
- ✅ _(v1.11)_ **Shift swaps / give-away** — a member offers a shift; a teammate claims it;
  manager approves. Closes the loop the rota opens. _(V5 E4)_
- ✅ _(v1.10)_ **Open shifts / shift bidding** — post an unassigned shift; eligible members
  claim or express interest; manager confirms. _(V4 E4)_
- ✅ _(v1.10)_ **Availability & preferences** — members mark days/times they can’t work;
  quick-fill and the day editor respect it (like time off but recurring). _(V5 E3)_
- ✅ _(v1.10)_ **Custom shift templates** — beyond the restaurant short/long week, let each org
  define named patterns (e.g. “Opening 7–15”, “Close 15–23”) and one-tap apply. _(V4 E3)_
- **Shift roles / positions** — assign a role per shift (bar, kitchen, floor) and
  require N of each per day; warn on understaffing. _(V4 E4)_
- ✅ _(v1.10)_ **Coverage requirements** — per-location, per-day minimum headcount with a
  visual “understaffed” flag in the grid. _(V4 E3)_
- **Recurring shifts** — “every Monday 9–17 until end of quarter” without
  re-drawing each month. _(V3 E3)_
- ✅ _(v1.10)_ **Shift confirmation** — members acknowledge a published shift (“Got it”);
  managers see who hasn’t confirmed. _(V3 E2)_
- 🟡 _(v1.11: 11 h rest, > 6 days in a row)_ **Conflict & fatigue rules** — warn on
  back-to-back closes/opens (clopening), <11 h rest between shifts, >X
  consecutive days. _(V4 E3)_
- 🟡 _(v1.14 rota cost; no target yet)_ **Budget / labour-cost view** — planned
  hours × wage per location per week, vs a target; live as you draft. _(V4 E4)_

### B. Time & attendance
- **Geofenced / QR clock-in** — only allow clock-in at the location (GPS radius or
  a printed QR at the venue) to stop off-site punches. _(V4 E4)_
- **Break tracking** — start/stop unpaid breaks instead of the flat mandatory-break
  deduction; more accurate net hours. _(V4 E3)_
- ✅ _(v1.9 late alerts)_ **Clock-in reminders** — nudge a member when their shift starts and they haven’t
  clocked in (complements the manager-facing late alert). _(V3 E2)_
- **Missed-clock-out correction** — a lightweight request/approve when auto-end
  midnight isn’t right, instead of admin-only edits. _(V3 E3)_
- **Overtime rules** — configurable daily/weekly overtime thresholds surfaced in
  Overview and exports. _(V3 E3)_

### C. Manager analytics
- 🟡 _(v1.14 morning digest)_ **Team dashboard** — who’s in today, understaffed
  locations, pending approvals, late/absent, all on one manager home. _(V5 E3)_
- ✅ _(v1.14 analytics)_ **Attendance & punctuality report** — late/no-show counts
  per member over a period. _(V3 E3)_
- ✅ _(v1.14 analytics + payroll export)_ **Labour-cost & hours trends** — hours and
  cost per location/member, export to payroll. _(V4 E3)_
- ✅ _(v1.14 analytics)_ **Forecast vs actual** — planned hours vs worked hours
  variance. _(V3 E4)_

### D. Payroll & compliance (Czech-specific)
- ✅ _(v1.14)_ **Payroll export** — a period export shaped for Czech payroll (net
  hours, overtime, weekend/holiday premiums) as CSV/XLSX. _(V5 E3)_
- ✅ _(v1.10)_ **Czech public holidays** — auto-mark státní svátky in the rota + holiday-pay
  flags. _(V4 E2)_
- ⛔ _(left out by the owner — could put off customers)_ **DPP/DPČ hour caps** —
  warn when a member on a Dohoda approaches the legal monthly/annual hour limit.
  _(V4 E3)_
- **Rest-period compliance report** — flag legal rest/break violations for audit. _(V3 E3)_

### E. Employee experience
- ✅ _(v1.10)_ **My hours & pay estimate** — a member’s running month total +
  estimated pay (if wage is stored). _(V4 E2)_
- 🟡 _(v1.13 ICS feed; no widget)_ **Wallet-style shift widget / calendar sync** —
  subscribe to your rota as an ICS feed or add to Google/Apple Calendar. _(V4 E3)_
- ✅ _(v1.10)_ **In-app announcements** — managers post a note to a location/team; shows on
  home with read receipts. _(V3 E3)_
- 🟡 _(v1.14 employee documents; no payslips)_ **Document sharing** — payslips /
  contracts / training docs per member. _(V3 E4)_
- 🟡 _(v1.14, for new owners)_ **Onboarding checklist** — guided first-run for new
  employees. _(V2 E2)_

### F. Communication
- **Direct + group messaging** — lightweight team chat scoped to org/location
  (or integrate rather than build). _(V3 E5)_
- **Broadcast + acknowledge** — “Shift covered tonight?” with quick replies. _(V3 E3)_
- 🟡 _(v1.14 daily manager digest via push / Telegram)_ **Email digests** — weekly
  rota email to each member; daily manager summary. _(V3 E2)_

### G. Multi-location & org
- **Cross-location staff pool** — share staff between sister venues; see who’s
  free org-wide. _(V4 E4)_
- **Location groups / regions** — roll up analytics for a manager over several
  venues. _(V3 E3)_
- 🟡 _(v1.10, unused yet)_ **Per-location settings** — open hours, timezone, break rules, wage bands. _(V3 E3)_

### H. Platform & technical
- ✅ _(v1.14: 480+ unit tests, Playwright E2E in CI)_ **Automated tests + E2E** —
  Playwright happy-paths in CI (login, clock-in, publish, request time off). _(V5 E3)_
- **Error monitoring** — Sentry (or similar) for web + native crash reporting. _(V4 E2)_
- **Analytics / product metrics** — privacy-respecting usage analytics to guide
  the roadmap. _(V3 E2)_
- **Offline queue** — queue clock-in/out offline and sync on reconnect. _(V4 E4)_
- **Performance budget** — code-split the heavy export libs further; lazy-load
  the schedule grid; track bundle size in CI. _(V3 E3)_
- ✅ _(v1.10 glass redesign)_ **Design-system pass** — extract the ad-hoc Tailwind patterns into documented
  primitives (Button/Card/Modal/Table) for consistency. _(V3 E3)_
- **Backup/restore & audit retention** — scheduled DB backups + an audit-log
  retention policy. _(V3 E2)_

### I. Growth & product
- ✅ _(v1.11)_ **Self-serve org signup** — create an organization without manual
  provisioning; onboarding flow. _(V4 E4)_
- ✅ _(v1.12, free beta for now)_ **Billing / plans** — tiered plans
  (seats/locations) if this becomes a product. _(V3 E5)_
- **Templates by venue type** — starter rosters for café / restaurant / retail. _(V2 E2)_
- **Referral / multi-tenant admin** — a super-console for managing many orgs. _(V2 E3)_

### J. Trust & security
- **2FA / stronger auth** for admins (TOTP). _(V4 E3)_
- **Session management** — see & revoke active devices; force-logout. _(V3 E3)_
- **Audit export** — download the Activity Log for a period (compliance). _(V3 E2)_
- ✅ _(v1.11 custom roles)_ **Granular permissions** — beyond ranks, per-capability toggles for edge orgs. _(V2 E4)_

---

## 🧭 Recommendations & advice

Opinionated guidance for where to invest next (updated after v1.14).

1. **Get the money side ready before the beta ends.** Czech-compliant invoices,
   the DPA and trial / dunning emails (plan §1) are what stands between the free
   beta and the first paying customer.
2. **Make attendance trustworthy.** **Kiosk / QR / geofenced clock-in** (B) is the
   single feature that turns “nice rota app” into “system of record” for a
   restaurant — it stops buddy-punching and off-site clock-ins. High ROI.
3. **Ship to the stores.** iOS push (#89), Firebase for `com.shiftella.app`,
   Google / Apple sign-in and store listings — staff expect an app, not a link.
4. **Add error monitoring.** Sentry (web + native) will surface real user-facing
   failures that uptime checks and E2E can't see. Two hours of setup.
5. **Auto-scheduling next.** Availability, rest rules, coverage targets and rota
   cost are all in place — a suggested rota is now mostly assembly.
6. **Decide with data.** Lightweight, privacy-respecting product metrics (which
   features are used, where people drop off) will show which ideas above earn
   their place.
7. **Keep the bundle lean and finish accessibility.** Lazy-load heavy views,
   track bundle size in CI, and do a focused a11y pass (contrast, focus, keyboard
   through the grid) to reach WCAG AA.

---

## 📌 How work is tracked

- **Issues** — one per concrete task, labelled by `area:*` and `priority:*`.
- **Milestones** — group issues into shippable chunks.
- **Releases** — semver tags (`vX.Y.Z`) + GitHub Releases with changelogs; notable
  releases carry a Czech-town codename A→Z (v1.9.0 = _Adamov_, v1.10.0 = _Beroun_, v1.11.0 = _Cheb_, v1.12.0 = _Děčín_, v1.13.0 = _Ejpovice_, v1.14.0 = _Frýdlant_; next = _G_).

Have an idea or found a bug? Open an issue.
