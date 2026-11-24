# Shiftella on the shared Hetzner server

Shiftella's web app is a static Vite SPA. There is no server-side code: the backend is hosted Supabase and stays there. It runs on the **anwar.os Hetzner server**: CAX21, arm64, Ubuntu 24.04, Docker.

On that server one **edge Caddy** container (compose project `edge`, owned by the anwar.os repo `NnnotAnwar/anwar-os` → `infra/edge`) holds ports 80/443 and gets HTTPS certificates for every domain on its own. Shiftella adds:

| Piece | In this repo | On the server |
|---|---|---|
| Site file (domains, headers, CSP, caching, SPA fallback) | `deploy/hetzner/shiftella.caddy` | `/opt/edge/sites/shiftella.caddy` (mounted read-only into the edge at `/etc/caddy/sites/`) |
| Static builds | `.github/workflows/deploy-hetzner.yml` builds `dist/` | `/srv/sites/shiftella/{prod,dev}/releases/<sha>` + `current` symlink (the same path inside the edge, read-only) |
| Release switcher | `deploy/hetzner/bin/shiftella-release` | `/usr/local/bin/shiftella-release`, the forced SSH command of user `shiftella-deploy` |
| One-time setup | `deploy/hetzner/setup-shared.sh` | run once as root, can be re-run safely |

| Environment | URL | Branch | Supabase project |
|---|---|---|---|
| production | https://shiftella.app (`www` → apex) | `master` | `dcqvipzjqxpbaymaxhxu` |
| preprod | https://dev.shiftella.app (basic auth, `noindex`) | `dev` | `fusnqxykhdzcvhqbsevb` |

## How a deploy works

1. GitHub Actions builds the SPA with the environment's `VITE_*` values. The workflow checks that `VITE_SUPABASE_URL` is that environment's project.
2. It runs `tar -cz -C dist . | ssh shiftella-deploy@HOST "deploy <env> <sha>"`. The CI key can only run `shiftella-release` (`restrict,command=…`). The script:
   - reads the arguments from `SSH_ORIGINAL_COMMAND`;
   - unpacks into `releases/<sha>`;
   - checks that `index.html` exists;
   - carries recent `/assets/*` forward, so open tabs can still lazy-load their old chunks;
   - swaps `current` atomically (`ln -sfn` + `mv -T`) and keeps the last 5 releases.
   
   The edge serves the new release right away. **No Caddy reload is needed.**
3. A smoke test checks that the live `index.html` is the new build, that the entry chunk loads, and that deep links fall back to the SPA.
4. **Rollback:** Actions → *Deploy (Hetzner)* → Run workflow → action `rollback`, optionally with a sha. It only repoints the symlink, so it takes seconds.

`shiftella-deploy` has no sudo, isn't in the `docker` group, and can't open a shell. If its key leaks, the worst case is a wrong build in `/srv/sites/shiftella`: roll back and rotate the key.

## Setup (Anwar, once)

Before you start, the server is set up by the anwar.os repo (Docker plus the edge Caddy running).

1. **Make the CI deploy key** on your laptop:
   ```bash
   ssh-keygen -t ed25519 -N '' -C shiftella-ci -f shiftella-ci
   ```
   `shiftella-ci.pub` goes to the server. The private key `shiftella-ci` goes into GitHub secrets (step 4) and then gets deleted from the laptop.
2. **Run the setup** on the server as root:
   ```bash
   git clone https://github.com/NnnotAnwar/shiftella-app.git /tmp/shiftella && cd /tmp/shiftella
   sudo bash deploy/hetzner/setup-shared.sh "$(cat /path/to/shiftella-ci.pub)"
   ```
   It creates `shiftella-deploy`, `/srv/sites/shiftella/{prod,dev}` with a placeholder page, `/usr/local/bin/shiftella-release`, and the restricted key. If sshd uses `AllowUsers` / `AllowGroups`, the script prints a note: add `shiftella-deploy` there.
3. **DNS in Cloudflare**, zone `shiftella.app`. Add A and AAAA records pointing at the server's IPv4/IPv6 for `@`, `www` and `dev`:
   - **Proxy status: DNS only** (grey cloud), so the edge Caddy can get its own certificates;
   - TTL Auto;
   - leave Email Routing records (MX/TXT) as they are.
4. **GitHub** → repo `NnnotAnwar/shiftella-app` → Settings → Environments:
   - **`production`**: deployment branches = `master` only.
   - **`preprod`**: deployment branches = `dev`.
   
   In **each** environment add:

   | Kind | Name | Value |
   |---|---|---|
   | secret | `HETZNER_HOST` | server **IPv4** (GitHub runners have no IPv6) |
   | secret | `HETZNER_SSH_KEY` | contents of `shiftella-ci` (private key) |
   | secret | `HETZNER_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <IPv4>`; check the fingerprint against the Hetzner console |
   | variable | `VITE_SUPABASE_URL` | `https://dcqvipzjqxpbaymaxhxu.supabase.co` (prod) / `https://fusnqxykhdzcvhqbsevb.supabase.co` (preprod) |
   | variable | `VITE_SUPABASE_PUBLISHABLE_KEY` | that project's publishable (anon) key |
   | secret, **preprod only** | `DEV_BASIC_AUTH` | `anwar:<dev password>`, used by the smoke test |

   `VITE_PUBLIC_SITE_URL` is set by the workflow itself (`https://shiftella.app` / `https://dev.shiftella.app`).
5. **Install the site file** in the edge. This needs Docker access, so you do it, not CI:
   ```bash
   cd /tmp/shiftella && git pull
   hash=$(docker compose -p edge exec -T caddy caddy hash-password --plaintext '<dev password>')
   sed "s|__DEV_AUTH_HASH__|$hash|" deploy/hetzner/shiftella.caddy | sudo tee /opt/edge/sites/shiftella.caddy >/dev/null
   docker compose -p edge exec caddy caddy validate --config /etc/caddy/base/Caddyfile --adapter caddyfile
   docker compose -p edge exec caddy caddy reload --config /etc/caddy/base/Caddyfile --adapter caddyfile
   ```
   Do the same after every change to `shiftella.caddy`. CI already validates the file on every PR (`ci.yml` → job `caddy`).
6. **Supabase Auth**, in each project → Authentication → URL Configuration:
   - **preprod:** Site URL `https://dev.shiftella.app`; Redirect URLs `https://dev.shiftella.app/**`.
   - **prod:** Redirect URLs `https://shiftella.app/**` now. Site URL `https://shiftella.app` at the cut-over (step 8).
   - Keep the old `*.vercel.app` entries during the transition.
   - Edge Function secret `APP_URL` = `https://shiftella.app` (prod) / `https://dev.shiftella.app` (preprod). It's used by billing for the Stripe return URLs.
   - The email templates need no change. Invite and reset use `{{ .RedirectTo }}`, which the app sends from its own origin.
7. **First deploys:** Actions → *Deploy (Hetzner)* → Run workflow:
   - target `preprod`, on branch `dev`. Open https://dev.shiftella.app with the browser console open and click through the app. The CSP is enforced on dev, so a blocked origin shows up there.
   - then target `production`, on branch `master`.
8. **Cut over.** `shiftella.app` is a new domain, so nothing switches away from Vercel and there's no downtime:
   - set the prod Site URL to `https://shiftella.app`;
   - the prod CSP is **enforced** in `shiftella.caddy` (since v1.14; it was Report-Only before). Reinstall the file (step 5) when that release goes to prod;
   - rebuild the native apps with the new web URL for email links (`VITE_PUBLIC_SITE_URL`).
9. **Automatic deploys:** in `deploy-hetzner.yml`, uncomment the `push:` block (master → production, dev → preprod). In Vercel, disconnect Git, so pushes don't deploy in two places.
10. **Decommission Vercel**, after 2–4 weeks:
    - uninstall the **Vercel ↔ Supabase integration**, which still overwrites the preprod Site URL on every Vercel deploy;
    - keep the old `*.vercel.app` production URL alive as a redirect to `https://shiftella.app` for a while, because old emails, old native builds and installed PWAs point there;
    - then remove the old URLs from the Supabase allow-lists and delete `vercel.json`.

## Headers and CSP

- **Edge headers.** The edge `security_headers` snippet adds HSTS, nosniff, Referrer-Policy, `X-Frame-Options: DENY`, COOP `same-origin`, and a Permissions-Policy that turns off camera, mic, geolocation, payment and USB. All of these fit Shiftella: it uses no geolocation, and billing is a **redirect** to Stripe Checkout, not embedded Stripe.js.
- **CSP.** `shiftella.caddy` adds only the CSP. It allows the environment's Supabase project (https + wss), Google Fonts, Fontshare, and `data:`/`blob:` for exports.
- **Adding a third-party script** means changing the CSP first. For example, embedding Stripe.js needs `script-src https://js.stripe.com`, `frame-src https://js.stripe.com https://hooks.stripe.com` and `connect-src https://api.stripe.com`. It also needs a `payment=(self)` Permissions-Policy override in our block, plus a note to the anwar.os side.
- **No eval.** zod used to probe `new Function` (one CSP report per page load); it now runs `jitless` (`src/shared/zodCsp.ts`). Never add `'unsafe-eval'`.
- **Tested in CI.** The E2E job (`ci.yml` → `e2e`, docs/e2e.md) serves the app with the CSP line from `shiftella.caddy`, enforced, and fails on any violation — including exports and every main screen. Change the CSP → run `corepack yarn e2e`.
- **Rollback.** If prod ever breaks on a blocked origin: set the last argument of the prod block back to `Content-Security-Policy-Report-Only`, reinstall (step 5), then fix the policy.

## Server commands (as root)

```bash
sudo -u shiftella-deploy /usr/local/bin/shiftella-release list prod      # releases, newest first
sudo -u shiftella-deploy /usr/local/bin/shiftella-release rollback prod  # back to the previous one
sudo -u shiftella-deploy /usr/local/bin/shiftella-release current dev
```
After changing `bin/shiftella-release`, re-run `setup-shared.sh` to install the new copy. CI can't update it, because the forced command is that file.

## Later

- **Per-PR previews:** e.g. `pr-<n>.dev.shiftella.app` with a wildcard certificate. That needs a DNS-challenge Caddy module in the edge image and a Cloudflare API token, so it's not set up.
- **Monitoring:** an uptime check on `https://shiftella.app/` and `/login`, e.g. UptimeRobot or Better Stack free tier, or the anwar.os monitoring.
- **Backups:** nothing to back up for Shiftella here. Every release can be rebuilt from git, and the data lives in Supabase.
