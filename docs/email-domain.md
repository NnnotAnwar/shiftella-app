# Sending email from shiftella.app

Auth emails (invites, password reset, confirmations) go out through **Resend**, which Supabase Auth uses as its custom SMTP. Today the sender is on **anwarnnnot.com**. This moves it to **noreply@shiftella.app** and adds a **support@shiftella.app** inbox.

DNS for shiftella.app is on **Cloudflare**. Nothing else changes: the Resend SMTP password (API key), the templates and the app code stay as they are.

## 1. Add the domain in Resend
Resend → **Domains → Add domain** → `shiftella.app`, region **Ireland (eu-west-1)**, the same region as Supabase. Resend then shows 3 DNS records:

| Type | Name (in Cloudflare) | Value |
|---|---|---|
| TXT | `resend._domainkey` | the long `p=MIIB…` key shown by Resend (DKIM) |
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com`, priority **10** |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |

Always copy the values from Resend. The table only shows what to expect.

## 2. Add them in Cloudflare
Cloudflare → **shiftella.app → DNS → Records → Add record**, once per row above.
- Enter only the short name (`send`, `resend._domainkey`); Cloudflare adds `.shiftella.app` itself.
- MX and TXT records have no orange cloud. If one shows up, set it to **DNS only**.

Also add DMARC, which keeps the email out of spam and sends the daily reports:

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:anuarkairulla@gmail.com; adkim=r; aspf=r` |

## 3. Verify in Resend
Resend → the domain → **Verify DNS records**. Wait until all rows are green, usually a few minutes.

## 4. Switch the sender in Supabase (both projects)
For **shiftella** (prod) and **dev-shiftella** (preprod): **Authentication → Emails → SMTP Settings**.
- **Sender email:** `noreply@shiftella.app`
- **Sender name:** `Shiftella`
- Leave host, port, user and password as they are → **Save**.

## 5. Test
1. On dev.shiftella.app → **Forgot password**, send it to your own address.
2. The email should come from **Shiftella &lt;noreply@shiftella.app&gt;** and arrive in the inbox, not spam.
3. Gmail → ⋮ → **Show original**: SPF, DKIM and DMARC should all say **PASS**.
4. Repeat on shiftella.app.

## 6. Optional: support@shiftella.app inbox
Cloudflare → shiftella.app → **Email → Email Routing → Get started**.
- Add the route `support@shiftella.app` → your Gmail and confirm the email Cloudflare sends.
- Cloudflare adds its own MX/SPF records on the root domain; they don't clash with Resend's records on `send`.

Then the app can show `support@shiftella.app` (the `SUPPORT_EMAIL` constant in `src/shared/brand.ts`).

## 7. Later
- Keep anwarnnnot.com in Resend for a couple of weeks, then remove it.
- After about 2 weeks of DMARC reports showing `pass`, change the DMARC value to `p=quarantine`. Then mail forged in shiftella.app's name goes to spam.
