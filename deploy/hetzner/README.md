# Hosting on Hetzner Cloud (Vercel → Hetzner runbook)

This is the plan and the files for moving the **web hosting** of Shiftella from
Vercel to one small Hetzner Cloud server. **Supabase stays where it is**: only
the static SPA moves. Nothing here has been bought, created or switched yet.
Following the steps takes about 30 minutes, plus the time DNS needs to propagate.

| File | What it is |
|---|---|
| `cloud-init.yaml` | Sets up the server on first boot: users, SSH hardening, firewall, auto-updates, fail2ban, Caddy, release folders |
| `Caddyfile` | Web server config for `shiftella.app` (+ `www`) and `dev.shiftella.app` |
| `bin/shiftella-release` | Runs on the server: switches releases atomically, rolls back, prunes old ones. Uploaded by the workflow on every deploy |
| `../../.github/workflows/deploy-hetzner.yml` | Build, upload, switch, smoke test; also manual rollback. **Manual-only until step 9** |

---

## 1. The setup and why

- **One Hetzner Cloud VM**: CX22/CX23 (2 vCPU, 4 GB, x86) or CAX11 (ARM, same
  price). Ubuntu 24.04, location **Falkenstein (fsn1)** or **Nuremberg (nbg1)**.
  The server is in the EU (GDPR) and close to Czech users. The app is a static
  build of about 3 MB, so even the smallest server has far more capacity than it
  needs, and 20 TB of traffic is included.
- **Caddy** serves the built `dist/` folders. It gets and renews HTTPS
  certificates by itself, supports HTTP/2 and HTTP/3, compresses with zstd/gzip,
  and the whole config is one short file. No Docker and no Node run on the server.
- **Builds run in GitHub Actions** (same Yarn Berry/Corepack setup as CI). The
  workflow uploads the build with rsync to
  `/srv/shiftella/<site>/releases/<sha>/` and then flips the `current` symlink.
  The switch is atomic: visitors never see a half-uploaded site. The last 5
  releases stay on disk, so **a rollback takes about 1 second** and needs no rebuild.
- Two sites on the same box:

  | Site | Folder | Git branch | GitHub Environment | Supabase |
  |---|---|---|---|---|
  | `https://shiftella.app` (+ `www` → apex) | `/srv/shiftella/prod` | `master` | `production` | prod `dcqvipzjqxpbaymaxhxu` |
  | `https://dev.shiftella.app` | `/srv/shiftella/dev` | `dev` | `preprod` | preprod `fusnqxykhdzcvhqbsevb` |

**Alternative considered: Hetzner + Coolify (or Docker + Traefik).** Coolify
gives a Vercel-like dashboard: git-push deploys, preview URLs per PR, and
one-click databases. For a single static SPA it adds a lot: Docker, a Coolify
control plane with its own Postgres and Redis, and its own updates to apply.
That needs a bigger server (at least 2 GB just for Coolify) and gives you more
to secure and maintain. There is nothing server-side to containerise here. Plain
Caddy plus a symlink switch is simpler, cheaper and easier to debug. Reconsider
Coolify only if more services (APIs, workers) end up on this host.

---

## 2. Owner checklist (≈30 min)

### Step 1: Generate the deploy key (on your laptop, 1 min)

```bash
ssh-keygen -t ed25519 -N '' -C 'github-actions-deploy@shiftella' -f ~/.ssh/shiftella-deploy
cat ~/.ssh/shiftella-deploy.pub      # -> goes into cloud-init.yaml (deploy user)
cat ~/.ssh/id_ed25519.pub            # your personal key -> cloud-init.yaml (ops user)
```

If you have no personal key yet, create one with `ssh-keygen -t ed25519`.

### Step 2: Create the server (5 min)

1. Go to <https://console.hetzner.com>, create the project **Shiftella**, then **Add Server**.
2. Choose: Location **Falkenstein** or **Nuremberg**; Image **Ubuntu 24.04**;
   Type **Shared vCPU, CX22/CX23** (or Arm64 CAX11); Networking: **IPv4 + IPv6**
   (keep IPv4: GitHub runners can't reach IPv6-only hosts).
3. **SSH keys**: you can add your personal key, but cloud-init below disables
   root login. The key that matters is the one in `cloud-init.yaml`.
4. **Firewalls** (optional but free): create one allowing inbound TCP 22, 80,
   443 and UDP 443. This duplicates ufw on the server.
5. **Backups**: off (nothing on the server is stateful; see §6).
6. **Cloud config**: paste `deploy/hetzner/cloud-init.yaml` after replacing
   `REPLACE_WITH_YOUR_PERSONAL_SSH_PUBLIC_KEY` and
   `REPLACE_WITH_GITHUB_DEPLOY_SSH_PUBLIC_KEY` with the two `.pub` lines from step 1.
7. Name it `shiftella-web-1` and create it. Note the **IPv4** and **IPv6** addresses.
8. After about 3 minutes, check:
   ```bash
   ssh ops@<IPv4> 'cloud-init status --wait; sudo ufw status; systemctl is-active caddy fail2ban'
   ssh ops@<IPv4> 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'   # note the fingerprint
   ```
   If you can't log in (wrong key pasted), open Hetzner Console, select the
   server, use **Rescue / Rebuild**, and recreate it with corrected cloud-init.
   That takes 2 minutes, since nothing on the server needs to be kept.

### Step 3: DNS (5 min + propagation)

Create these records wherever `shiftella.app` is hosted (TTL **300** during the move):

| Type | Name | Value |
|---|---|---|
| A | `@` (shiftella.app) | `<IPv4>` |
| AAAA | `@` | `<IPv6>` (the `::1` address of the server's /64) |
| A | `www` | `<IPv4>` |
| AAAA | `www` | `<IPv6>` |
| A | `dev` | `<IPv4>` |
| AAAA | `dev` | `<IPv6>` |
| CAA *(optional)* | `@` | `0 issue "letsencrypt.org"` and `0 issue "sectigo.com"` (ZeroSSL fallback) |

Registrar and DNS: any registrar that sells `.app` works (Porkbun, INWX (EU),
Cloudflare Registrar). For DNS, use the registrar's own DNS, **Hetzner DNS**
(free, same console) or Cloudflare DNS. If you use Cloudflare, set the records
to **DNS only** (grey cloud) so Caddy can get its certificates directly and the
CSP/caching headers stay as written. `.app` is HTTPS-only by design (HSTS-preloaded
TLD): browsers never load it over plain http, and Caddy covers this.

Don't touch MX/SPF/DKIM records for the domain: email (Resend) is separate
from web hosting.

Check: `dig +short shiftella.app A; dig +short dev.shiftella.app AAAA`

### Step 4: GitHub Environments + secrets (5 min)

GitHub repo `NnnotAnwar/shiftella-app` → **Settings → Environments**
(<https://github.com/NnnotAnwar/shiftella-app/settings/environments>):

- **`production`**: Deployment branches: *Selected branches*, `master` only.
  Optionally add yourself as a *required reviewer*, so every prod deploy or
  rollback needs one click to approve.
- **`preprod`**: Deployment branches: `dev`. Add other branches you want to be
  able to send to preprod by hand (e.g. `release/*`).

In **both** environments add:

| Kind | Name | Value |
|---|---|---|
| Secret | `HETZNER_HOST` | server **IPv4** |
| Secret | `HETZNER_SSH_KEY` | contents of `~/.ssh/shiftella-deploy` (the *private* key, including the BEGIN/END lines) |
| Secret | `HETZNER_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <IPv4>`. Check that `ssh-keygen -lf <(ssh-keyscan -t ed25519 <IPv4>)` matches the fingerprint from step 2.8 |
| Variable | `VITE_SUPABASE_URL` | prod: `https://dcqvipzjqxpbaymaxhxu.supabase.co` / preprod: `https://fusnqxykhdzcvhqbsevb.supabase.co` (same values as in Vercel) |
| Variable | `VITE_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key (same as in Vercel). It's a public client key, so a variable is fine; a secret with the same name also works |

The workflow refuses to build if `VITE_SUPABASE_URL` doesn't match the
environment's project ref, which prevents a prod build from pointing at the
preprod DB. These are the only build-time env vars the app reads
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and the new optional
`VITE_PUBLIC_SITE_URL`, which the workflow sets itself).

### Step 5: Install the Caddyfile (2 min, after DNS resolves)

Install it only after step 3 resolves. Otherwise Caddy's certificate requests
fail and can briefly hit Let's Encrypt's rate limit.

```bash
scp deploy/hetzner/Caddyfile ops@<IPv4>:/tmp/Caddyfile
ssh ops@<IPv4> 'sudo install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile \
  && sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
  && sudo systemctl reload caddy && journalctl -u caddy -n 30 --no-pager'
```

Open <https://dev.shiftella.app>. It should show the placeholder page
("Shiftella is being set up") with a valid certificate. Repeat this command
whenever the Caddyfile changes; deploys don't need it.

### Step 6: Supabase Auth URLs (5 min, before the first real login on the new hosts)

Supabase dashboard → each project → **Authentication → URL Configuration**.
**Keep the old Vercel entries until Vercel is decommissioned (§8).**

| Project | Site URL | Redirect URLs, add (keep existing) |
|---|---|---|
| prod `dcqvipzjqxpbaymaxhxu` | `https://shiftella.app` *(set at cut-over, step 8)* | `https://shiftella.app/**` |
| preprod `fusnqxykhdzcvhqbsevb` | `https://dev.shiftella.app` | `https://dev.shiftella.app/**` |

Why this matters here:
- **Sign-up confirmation** (`supabase/templates/confirm-signup.html`) uses
  `{{ .ConfirmationURL }}`, which ends at the app's `emailRedirectTo` =
  `<origin>/login`. If that origin isn't in the allow-list, Supabase silently
  falls back to the **Site URL**.
- **Invites** (`supabase/templates/invite-user.html`) link to
  `{{ .RedirectTo }}` = `<origin>/accept-invite`, sent by the browser
  (`adminService.tsx`). Not `{{ .SiteURL }}`, so the **email templates need no
  change**. The redirect must still be allow-listed, otherwise GoTrue rejects it.
- The `invite-employee` Edge Function falls back to an optional `SITE_URL`
  function secret. Check `supabase secrets list --project-ref <ref>`; if
  `SITE_URL` points at a vercel.app URL, set it to the new domain.
- The **Vercel ↔ Supabase integration** currently rewrites the preprod Site
  URL on every Vercel deploy. Once Vercel stops deploying, it stops doing that.
  Until then, a Vercel deploy can undo the preprod Site URL you set here, so
  re-check it after the cut-over and uninstall the integration (§8).

### Step 7: First deploy to preprod (3 min)

GitHub → **Actions → Deploy (Hetzner) → Run workflow**, branch `dev`, target
`preprod`, action `deploy`. The run builds, uploads, switches, then smoke-tests
<https://dev.shiftella.app>: the live `index.html` must equal the build, the
entry chunk must load, and the deep link `/login` must fall back to the SPA.

Then click through dev.shiftella.app: log in, clock in/out (realtime board
updates), send an invite and open it, confirm a sign-up, and export a PDF and an
XLSX. Keep the browser console open: there should be **no CSP errors** (CSP is
enforced on dev). The single exception is a CSP message about `eval`, which
comes from zod's feature probe `new Function("")` and is harmless (zod falls
back automatically). Don't add `'unsafe-eval'` for it.

### Step 8: Production cut-over (5 min)

`shiftella.app` is a new domain, so there's **no DNS cut-over away from Vercel**.
`planuj-smeny.vercel.app` keeps working the whole time, so this is zero-downtime
by construction:

1. Run workflow: branch `master`, target `production`, action `deploy`.
2. Click through <https://shiftella.app> as in step 7. The prod CSP starts in
   **Report-Only**: check the console for `[Report Only]` violations. If there
   are none, change the last argument of the `shiftella.app` block in the
   Caddyfile to `Content-Security-Policy` and re-run step 5.
3. Supabase prod: set **Site URL** to `https://shiftella.app` (keep
   `https://planuj-smeny.vercel.app/**` in Redirect URLs).
4. Tell users about the new address. Old bookmarks keep working until §8, then
   redirect.

*If `shiftella.app` was pointed at Vercel in the meantime:* lower its TTL to
300 s at least a day ahead, deploy to Hetzner first (with **skip_smoke_test**,
since the domain doesn't point at Hetzner yet), then switch the A/AAAA records.
Both hosts serve the same build while DNS propagates. Run step 5 right after
switching so Caddy gets its certificate. Raise the TTL back to 3600 a day later.

### Step 9: Turn on automatic deploys

In `.github/workflows/deploy-hetzner.yml`, uncomment:

```yaml
  push:
    branches: [master, dev]
```

Then disconnect Git in the Vercel project (Settings → Git → Disconnect), so the
two hosts don't both deploy on every push. From now on: merge to `dev` deploys
dev.shiftella.app, and merge to `master` deploys shiftella.app.

---

## 3. Day-to-day: deploy, roll back, inspect

- **Deploy**: push/merge (after step 9) or *Run workflow → deploy*.
- **Roll back**: *Run workflow → target → action `rollback`*. With an empty
  `rollback_to`, it switches back to the previously live release, and running
  it again toggles forward. You can also give a sha (7+ characters) to pick any
  of the last 5. On the server:
  ```bash
  ssh deploy@<IPv4> /srv/shiftella/bin/shiftella-release list prod
  ssh deploy@<IPv4> /srv/shiftella/bin/shiftella-release rollback prod [<sha>]
  ```
  A rollback only changes the web build. Database migrations are **not** rolled
  back, so for a schema change, roll forward with a fix instead.
- **Old browser tabs** after a deploy: route chunks are lazy-loaded, so the
  release script hard-links the previous release's hashed `/assets/*` files
  (from builds in the last 14 days) into the new release. A tab opened before
  the deploy can still load its chunks.
- **Logs**: `sudo tail -f /var/log/caddy/shiftella-prod.log` (JSON access
  logs, rotated at 50 MB, kept for 14 days). They contain IP addresses: mention
  "web server access logs, 14 days" in the privacy policy.

## 4. What the Caddyfile does

- SPA fallback: unknown paths serve `index.html`. A missing `/assets/*` returns
  a real **404**, never HTML.
- Caching: `/assets/*` gets `max-age=1y, immutable` (hashed names).
  `index.html` and `manifest.webmanifest` get `no-cache`. `/icons/*` and
  `favicon.svg` get 1 day. There's no service worker today; if one is added,
  give `sw.js` `no-cache` too.
- Compression: zstd + gzip.
- Headers: HSTS (2 years, includeSubDomains), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  COOP `same-origin`, and a Permissions-Policy that denies camera, mic,
  geolocation and similar (the web app uses none of them). `dev` also sends
  `X-Robots-Tag: noindex`.
- **CSP** allows only what the app loads today: own origin; the site's Supabase
  project over `https` + `wss` (Realtime); Google Fonts (Inter:
  `fonts.googleapis.com` / `fonts.gstatic.com`); Fontshare (Satoshi:
  `api.fontshare.com` / `cdn.fontshare.com`); `data:`/`blob:` for images,
  fonts and exports. Scripts are `'self'` only; styles allow `'unsafe-inline'`.
  **Anything new must be added here first.** For example, billing with Stripe.js
  needs `script-src https://js.stripe.com`, `frame-src https://js.stripe.com
  https://hooks.stripe.com` and `connect-src https://api.stripe.com`. A plain
  redirect to Stripe Checkout needs nothing.

## 5. Previews later (not implemented)

To get per-PR previews like Vercel's:
1. DNS: wildcard `*.dev.shiftella.app` A/AAAA pointing at the server.
2. Caddy: either a wildcard certificate via DNS-01, which needs Caddy built with
   a DNS plugin (`xcaddy build --with github.com/caddy-dns/hetzner` or
   `.../cloudflare`, plus an API token), or **on-demand TLS** with an `ask`
   endpoint that only approves `pr-<n>` names that exist on disk (no plugin,
   one certificate per preview). A commented skeleton is at the bottom of the
   Caddyfile.
3. Workflow: a `pull_request` job (same-repo PRs only, never forks) builds with
   the **preprod** environment, rsyncs to `/srv/shiftella/previews/pr-<n>/`, and
   comments the URL. A `pull_request: closed` job deletes the folder.
4. Supabase preprod: add `https://*.dev.shiftella.app/**` to Redirect URLs.

## 6. Monitoring, backups, cost

**Monitoring**: use an external free checker, because a monitor on the same box
can't report that the box is down. UptimeRobot or Better Stack free tier work:
- HTTP(S) keyword monitors on `https://shiftella.app/` and
  `https://dev.shiftella.app/` (keyword `id="root"`, every 5 min), plus
  SSL-expiry alerts, emailed to you.
- Hetzner Console → server → Graphs shows CPU, disk and network. Optionally set
  a CPU/traffic alert there.
- Self-hosted Uptime Kuma is fine too, but on a *different* machine.

**Backups**: there is nothing to back up. The server holds only build output,
which GitHub can rebuild, and its whole setup is `cloud-init.yaml` + `Caddyfile`.
Disaster recovery means creating a new server (step 2), updating DNS and
`HETZNER_*` secrets, installing the Caddyfile and re-running the deploy, about 15 minutes.
Optional: take one snapshot after setup (a few cents per month). Hetzner's
automatic Backups (+20% of the server price) aren't needed. **Data** lives in
Supabase and is covered by Supabase's own backups (daily on Pro, PITR add-on).
This move doesn't change that.

**Cost per month** (excl. VAT; check the current Hetzner price list, which
changes now and then):

| Item | ≈ €/month |
|---|---|
| CX22/CX23 or CAX11 server | 3.5 – 4.5 |
| Primary IPv4 | 0.5 |
| Snapshot (optional) | < 0.1 |
| DNS (Hetzner / Cloudflare) | 0 |
| Monitoring (free tier) | 0 |
| `shiftella.app` domain (~€12–20/yr) | 1 – 1.7 |
| **Total** | **≈ €5 – 7** (+21% VAT if billed as a consumer in CZ) |

For comparison: Vercel Hobby is free but limited to non-commercial use, and
Vercel Pro costs $20 per seat per month.

## 7. Hardcoded Vercel references in the repo (`git grep -n vercel`)

| Where | What | Change |
|---|---|---|
| `src/features/auth/authService.ts` (`signUpOwner`) | Native app used the hardcoded `https://planuj-smeny.vercel.app` as the host for the sign-up confirmation link | **Changed**: now `import.meta.env.VITE_PUBLIC_SITE_URL`, falling back to the Vercel URL. Set `VITE_PUBLIC_SITE_URL=https://shiftella.app` in your local `.env` before building the next iOS/Android release (documented in `.env.example`). The web app keeps using `window.location.origin` |
| `vercel.json` | Vercel install command + SPA rewrite | Keep until §8, then see below |
| `README.md` (Hosting section) | Says hosting is Vercel | Update after step 9 |
| `.github/workflows/ci.yml` (comment) | Mentions Vercel historically | None |
| `supabase/templates/invite-user.html` (comment) | Explains why `{{ .RedirectTo }}` is used | None |

Outside the repo, check these too:
- Supabase Site URL and Redirect URLs (step 6).
- The `SITE_URL` function secret.
- **App Store Connect / Google Play privacy-policy and support URLs** (likely
  `…vercel.app/privacy` / `/terms`).
- Links in marketing material or emails.

`capacitor.config.ts` has no `server.url`, `hostname` or `allowNavigation`. The
native apps bundle `dist/` and never load the web host, so hosting needs no
Capacitor change. If universal links or App Links are added later, put
`apple-app-site-association` / `assetlinks.json` in `public/.well-known/` and
Caddy will serve them.

## 8. Decommission Vercel (after ~2–4 weeks on Hetzner)

- [ ] Hetzner has served both sites for a while without problems; uptime monitors are green.
- [ ] Automatic deploys are on (step 9) and Git is disconnected in Vercel.
- [ ] **Uninstall the Vercel ↔ Supabase integration** (Vercel → Integrations →
      Supabase → Manage → Uninstall; also Supabase → Project Settings →
      Integrations). Then re-check both projects' Site URLs (step 6), since the
      integration had been overwriting the preprod one.
- [ ] Native apps built with `VITE_PUBLIC_SITE_URL` are live in the stores, and
      store listings link to `shiftella.app`.
- [ ] Old URLs: redirect rather than delete, because older app builds and old
      emails still link to `planuj-smeny.vercel.app`. Do a last Vercel deploy
      with a redirect-only `vercel.json` (no build needed):
      ```json
      { "redirects": [ { "source": "/(.*)", "destination": "https://shiftella.app/$1", "permanent": true } ] }
      ```
      Do the same for `dev-planuj-smeny.vercel.app` → `https://dev.shiftella.app/$1`.
      Keep the Vercel project on Hobby (free) for as long as old app versions
      are in use.
- [ ] Remove the `*.vercel.app` entries from both projects' Supabase Redirect
      URLs *only after* the redirect is live and old app versions are gone.
- [ ] Remove `vercel.json` from this repo, update the README Hosting section,
      and drop the Vercel fallback in `authService.ts`.
- [ ] Remove Vercel env vars / tokens and revoke any Vercel GitHub app access
      you no longer need.

## 9. Risks and notes

- **Single server = single point of failure.** Hetzner's SLA is good, but
  there's no failover. Recovery is a ~15-minute rebuild (§6); the monitors tell
  you when it's needed. Unattended upgrades can reboot at 03:30 for kernel
  updates, which takes about 30 s offline.
- **CSP can break features** that load something new (payments, analytics,
  maps). That's why prod starts in Report-Only and dev enforces first. Update
  the Caddyfile together with such features.
- **Auth redirect allow-list**: forgetting step 6 makes confirmation and invite
  links land on the old Site URL. Keep old entries during the transition.
- **Node 20** is used for the build (same as `ci.yml`) and is past upstream
  EOL. Bump both workflows to Node 22/24 together.
- The deploy key can write to `/srv/shiftella` but has no sudo. If it leaks,
  rotate it: new key in `~deploy/.ssh/authorized_keys` and the `HETZNER_SSH_KEY`
  secret.
