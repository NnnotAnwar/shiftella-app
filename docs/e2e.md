# E2E tests (Playwright)

Two suites:

| Suite | Runs against | Needs | Command |
| --- | --- | --- | --- |
| **local** (`e2e/local`) | the real app + the in-memory **fake Supabase** from `tools/screenshots`, built into `dist-e2e/` and served under the **enforced production CSP** | nothing (no backend, no secrets) | `corepack yarn e2e` |
| **remote** (`e2e/remote`) | the deployed preprod, https://dev.shiftella.app (preprod Supabase) | a test account the owner created + the preprod basic-auth password | `corepack yarn e2e:remote` |

CI runs the local suite on every PR (`ci.yml` → job `e2e`, about 2 minutes). The remote suite never runs in CI.

## Local suite

```bash
corepack yarn playwright install chromium   # once
corepack yarn e2e                           # build dist-e2e + run everything
E2E_SKIP_BUILD=1 corepack yarn e2e auth     # re-run one file without rebuilding
corepack yarn playwright show-trace test-results/<test>/trace.zip   # after a failure
```

What it covers:

- **auth.spec** — landing → sign-in, wrong password, email sign-in, username sign-in (the `username-login` function), session survives a reload, sign-out (desktop + phone).
- **signup.spec** — the owner sign-up: landing CTA (free-beta wording) → form → "check your email"; the organization name and names reach `auth.signUp`; terms required; existing email.
- **invite.spec** — the owner invites an employee from Admin → the invite "email" link → the invitee sets a username + password → lands in the app as an Employee; an invalid link.
- **billing.spec** — free beta on: "Free beta", everything included, no plans to buy; beta off after the trial: the plans show.
- **csp.spec** — the server sends the CSP line of `deploy/hetzner/shiftella.caddy`; a violation really fails a test; every main screen and every public page render; PDF and Excel exports download.

Every test also fails on **any CSP violation** (console or `securitypolicyviolation` event) or uncaught page error (`e2e/local/fixtures.ts`).

How the fake backend does auth: with `localStorage['demo-auth']` set (the fixture does it), `tools/screenshots/fake/supabaseClient.ts` keeps who is signed in there, checks the demo password (`E2E_PASSWORD` in `tools/screenshots/fake/e2eConstants.ts`) for every demo account, keeps the dataset in `sessionStorage` so reloads see earlier writes, records what the app sent in `window.__fakeSupabase.calls`, and puts invite "emails" in `window.__fakeSupabase.outbox`. Without that key the screenshot harness behaves exactly as before.

Not covered locally (needs the real backend): the confirmation email itself, the DB trigger that creates the organization, RLS, the real invite email, Stripe. The SQL smoke tests in `supabase/tests` and the remote suite cover parts of that.

## Remote suite (optional, read-only)

It signs in to dev.shiftella.app, walks the main screens and the billing page, signs out, and checks the public pages for CSP violations. It **never creates or changes data** (no sign-ups, no invites), so it can run against preprod any time. Tests skip themselves when the variables are missing.

Owner, once:

1. In the **preprod** app (https://dev.shiftella.app) sign up a test organization owner, e.g. `e2e+owner@<your domain>`, confirm the email. Use a password you don't use anywhere else.
2. Run:

```bash
E2E_BASIC_AUTH='anwar:<dev password>' E2E_REMOTE_EMAIL='<test owner email>' E2E_REMOTE_PASSWORD='<its password>' corepack yarn e2e:remote
```

`E2E_REMOTE_URL` overrides the target (default https://dev.shiftella.app). Never point it at production with a real account.
