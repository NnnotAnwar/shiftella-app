# Uptime alerts (Telegram)

`.github/workflows/uptime.yml` checks production every 5 minutes, from GitHub Actions — no new accounts or services:

1. https://shiftella.app/ serves the app;
2. every JS/CSS file of that build loads, plus the landing page's lazy chunk and its images (`/landing/*.webp`);
3. prod Supabase (`dcqvipzjqxpbaymaxhxu`) answers: Auth health, and a read-only database call (`billing_free_beta`, the RPC the landing page makes as a guest). The public publishable key is read from the live bundle.

A failed request is retried; a failed round is checked again 45 s later. It alerts **only when the state changes**: one "🔴 Shiftella is DOWN" message (with what failed and a link to the run), then one "✅ back up (was down for N min)". Logic: `tools/uptime/uptime.mjs` (tests next to it). The last state is kept in the Actions cache.

As a fallback, the run also **fails once** when production goes down, so GitHub's own "workflow failed" email arrives too.

## Turn the Telegram alerts on (owner, once)

The alerts come from the existing bot **@shiftella_bot** to your own Telegram chat. You need:

- **the bot token**: in Telegram open @BotFather → `/mybots` → `@shiftella_bot` → **API Token**. (Only read it — do **not** press "Revoke", that would break the bot in the app.)
- **your chat id**: send any message to @userinfobot; it replies with your `Id` (a number).
- in @shiftella_bot press **Start** once if you never did (a bot can only write to people who started it).

Then, in the repo folder, run this one command. `gh` asks for each value (hidden input, nothing lands in the shell history):

```bash
gh secret set TELEGRAM_ALERT_BOT_TOKEN -R NnnotAnwar/shiftella-app && gh secret set TELEGRAM_ALERT_CHAT_ID -R NnnotAnwar/shiftella-app
```

Until both secrets exist the workflow still checks and records the state; it only skips the message (and says so in the run summary).

## When it starts

GitHub runs scheduled (and manually started) workflows only from the **default branch, `master`**. So the 5-minute checks start with the next release to master. Until then the workflow runs on pull requests that change it.

After the release, send yourself a test message:

```bash
gh workflow run uptime.yml -R NnnotAnwar/shiftella-app -f test_alert=true
```

## Notes

- GitHub may start scheduled runs a few minutes late under load, and disables schedules in repos with no activity for 60 days (it emails first; any push re-enables).
- Cost: the repository is public, so GitHub-hosted Actions minutes are free. If it ever goes private, each run bills a full minute (~8,600 min/month at `*/5`, above the 2,000 free) — then switch the cron to `*/15` or pause it.
- To pause: Actions → Uptime → "…" → Disable workflow.
