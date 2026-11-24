# Telegram bot

Shiftella's Telegram bot sends the same notifications as push, plus team announcements, and answers a few quick commands. Managers can approve or decline requests from the chat. It needs **three secrets**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_BOT_USERNAME`. The web build also needs one variable, `VITE_TELEGRAM_BOT_USERNAME`.

| Piece | Where |
|---|---|
| Tables + RPCs | `supabase/migrations/20261124150000_telegram_bot.sql` |
| Bot (webhook) | `supabase/functions/telegram-webhook/` (`index.ts`, pure helpers in `bot.ts`) |
| Telegram client, signing, notification sender | `supabase/functions/_shared/telegram.ts` |
| Event → message mapping (shared with push) | `supabase/functions/_shared/notify.ts` |
| Europe/Prague calendar math | `supabase/functions/_shared/prague.ts` |
| Notifications fan-out | `send-push` (FCM unchanged; Telegram added) |
| Settings block | `src/features/notifications/telegram/` |
| Webhook + command menus | `tools/telegram-setup.sh` |

> **One bot per environment.** A bot has exactly one webhook, so prod and preprod each need their own bot (for example `ShiftellaBot` for prod and `ShiftellaDevBot` for preprod). Each environment gets its own three secrets and its own `VITE_TELEGRAM_BOT_USERNAME`.

---

## 1. Create the bot (@BotFather)

In Telegram, open **@BotFather**:

1. `/newbot`
   - name: **Shiftella**
   - username: e.g. **ShiftellaBot** (it must end in `bot`). This is `TELEGRAM_BOT_USERNAME` (without the `@`).
   - BotFather replies with the **token**. This is `TELEGRAM_BOT_TOKEN`; keep it secret.
2. `/setuserpic` → choose the bot → send `public/icons/icon-512.png`.
3. `/setabouttext` → *Shift notifications and quick answers from Shiftella.* (`tools/telegram-setup.sh` also sets the description and the short description in CS and EN through the API.)
4. `/setjoingroups` → **Disable**. The bot only works in private chats.
5. Leave **privacy mode** on (the default).

Generate the webhook secret. It may contain only `A–Z a–z 0–9 _ -`, at most 256 characters:

```sh
openssl rand -hex 32   # → TELEGRAM_WEBHOOK_SECRET
```

## 2. Secrets (Supabase)

Set these per project (secret names only shown):

```sh
supabase secrets set --project-ref <project-ref> \
  TELEGRAM_BOT_TOKEN=<token from BotFather> \
  TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32> \
  TELEGRAM_BOT_USERNAME=<ShiftellaBot>
```

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase.
- `APP_URL` is already set for billing. It is optional here: it is the base for the "Open app" buttons and defaults to `https://shiftella.app`. Telegram rejects `http://` and `localhost` buttons, so those fall back to the default.
- `TELEGRAM_WEBHOOK_SECRET` also keys the HMAC that signs inline-button data. If you rotate it, old buttons stop working, which is harmless.

## 3. Database

Apply `20261124150000_telegram_bot.sql`. It creates:

- `telegram_links` — one Telegram chat per user. Users can read, update (only `muted`, `shifts`, `account`, `requests`, `announcements`) and delete their own row; only the bot inserts.
- `telegram_link_codes` — single-use codes that expire after 10 minutes. Only a SHA-256 hash is stored. Users have no access.
- `create_telegram_link_code()` — for the signed-in user. It refuses on the Free plan (`plan_required`).
- Bot RPCs, executable by **service_role only**: `telegram_link_consume`, `telegram_unlink_chat`, `telegram_context`, `telegram_pending_requests`, `telegram_decide`, `telegram_confirm_shifts`.
  - They resolve the user from the linked `chat_id`.
  - They switch `auth.uid()` to that user for the transaction, so the app's own checks apply unchanged: `can_review_request`, `_may_review_member_request`, `review_member_request`, `review_shift_swap`, `review_name_change_request`, the time-off update policy and the shift-confirmation insert policy.
- Activity log: `telegram_linked` and `telegram_unlinked`, in the Team group.

## 4. Deploy the functions

```sh
supabase functions deploy telegram-webhook --no-verify-jwt --project-ref <project-ref>
supabase functions deploy send-push        --no-verify-jwt --project-ref <project-ref>
```

| Function | verify_jwt | Why |
|---|---|---|
| `telegram-webhook` | **false** | Telegram sends no JWT. The `X-Telegram-Bot-Api-Secret-Token` header is checked in constant time, and anything else gets 401. |
| `send-push` | **false** (unchanged) | Database Webhooks. Redeploy it: it now imports `_shared/notify.ts` + `_shared/telegram.ts`. |

`send-push` needs no new webhooks. The existing ones on `shift_audit_log`, `name_change_requests` and `announcements` now also reach Telegram. Without `TELEGRAM_BOT_TOKEN`, `send-push` skips Telegram silently.

## 5. Webhook + command menus

Fastest: run the script. It is idempotent and does `setWebhook`, `setMyCommands` (EN + CS), and the descriptions:

```sh
TELEGRAM_BOT_TOKEN=<token> TELEGRAM_WEBHOOK_SECRET=<secret> SUPABASE_PROJECT_REF=<project-ref> \
  bash tools/telegram-setup.sh
```

Or do the same by hand.

**setWebhook:**

```sh
curl -sS -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://<project-ref>.supabase.co/functions/v1/telegram-webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message","callback_query"],"drop_pending_updates":true,"max_connections":20}'
```

**setMyCommands (default / EN):**

```sh
curl -sS -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setMyCommands" \
  -H 'Content-Type: application/json' \
  -d '{"commands":[{"command":"shifts","description":"Your shifts for the next 7 days"},{"command":"today","description":"Today'"'"'s shift and who else is on"},{"command":"hours","description":"Hours worked this month"},{"command":"news","description":"Latest announcements"},{"command":"requests","description":"Requests waiting for your decision"},{"command":"help","description":"What I can do"},{"command":"stop","description":"Disconnect this chat"}]}'
```

**setMyCommands (CS):**

```sh
curl -sS -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setMyCommands" \
  -H 'Content-Type: application/json' \
  -d '{"language_code":"cs","commands":[{"command":"shifts","description":"Vaše směny na příštích 7 dní"},{"command":"today","description":"Dnešní směna a kdo je s vámi"},{"command":"hours","description":"Odpracované hodiny tento měsíc"},{"command":"news","description":"Nejnovější oznámení"},{"command":"requests","description":"Žádosti, které čekají na vás"},{"command":"help","description":"Co umím"},{"command":"stop","description":"Odpojit tento chat"}]}'
```

The commands are the same English words in both languages; only their descriptions are translated.

Check the webhook with `curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"`. Look at `url`, `pending_update_count` and `last_error_message`.

## 6. The app (Settings block)

Set **`VITE_TELEGRAM_BOT_USERNAME`** (without the `@`) for each environment's build:

- Hetzner: a GitHub *environment variable* of that name. `deploy-hetzner.yml` passes it to the build.
- Vercel or local: `.env`.
- Native apps: set it before `yarn build && npx cap sync`.

While it is unset, the Telegram block is hidden, so deploying the app before the bot exists is safe.

What users see under **Settings → Notifications → Telegram**:

- **Not linked:** **Connect**.
  - The app creates a code and opens `https://t.me/<bot>?start=<code>`: a new tab on the web; on native, Capacitor hands the link to the OS, which opens the Telegram app.
  - Then it polls every 2.5 s (and on focus) for up to 10 minutes until the link appears. **Cancel** stops waiting.
  - If the browser blocks the tab, an "Open Telegram" link is shown instead.
- **Linked:** "@username · linked", **Disconnect**, and the bot's own switches:
  - Messages in Telegram (mute)
  - Shift changes
  - Account & profile
  - Requests to review (reviewers only)
  - Announcements
- **Free plan, not linked:** the upgrade prompt (Telegram is part of push, which is Team+). An existing link can still be disconnected.

## 7. What the bot does

Commands are **English in every language** (the replies and the menu follow the user's app language, CS or EN).

| Command / menu button | Reply |
|---|---|
| `/start <code>` | Links the chat. The code is single-use and expires after 10 minutes; the welcome also shows the menu. |
| `/start` (no code), `/help`, `/menu`, **❓ Help** | How to link (with a link to shiftella.app), or the command list and the menu. |
| `/stop` | Unlinks and removes the menu. |
| `/shifts`, **📅 Shifts** | Published shifts for the next 7 days (✓ confirmed, ○ not yet), with **Confirm shifts**, **◀ / Next week ▶** (up to 8 weeks ahead, the message is redrawn in place) and **Open app**. Confirming redraws the list with ✓. |
| `/today`, **📍 Today** | Today's shift, whether you are clocked in (read only), and who else is on at the same place; **🔄 Refresh** redraws it. |
| `/hours`, **⏱ Hours** | This month's net hours, with the same mandatory-break rule as My hours (−30 min per started 6 h), against planned shifts; **◀ Previous month / Next month ▶** (up to 12 months back). |
| `/news`, **📣 News** | The latest 3 announcements. |
| `/requests`, **📥 Requests** | People who can decide get up to 5 cards with **Approve / Decline** (the rest stay in the app). Others get "you don't decide requests". The menu button is shown to reviewers only. |

**Menu:** a persistent reply keyboard under the message box (📅 Shifts · 📍 Today / ⏱ Hours · 📣 News / 📥 Requests · ❓ Help), sent with the welcome, `/help` and any unrecognised text. The labels are localized and matched in both languages.

**Never:** clocking in or out through the bot. Attendance stays in the app.

Notifications cover every event `send-push` handles, plus announcements with their **full** body.

- Schedule-published and schedule-changed messages carry a **Confirm** button, which confirms the recipient's published, upcoming shifts in that window.
- Delivery follows the link's switches, mute, and the org plan (`org_plan() <> 'free'`, the same gate as push).
- A 403 (bot blocked) deletes the link.
- A 429 is retried once in place when `retry_after` ≤ 3 s; otherwise it is reported back as `telegram_retry_after` in send-push's response.

**Security:**

- Identity comes only from the linked `chat_id`, and only in private chats (`chat.type = private`, `from.id = chat.id`). Group chats are ignored.
- Inline-button data is `<payload>:<HMAC>`, signed per chat and ≤ 64 bytes. Every action is re-checked in SQL as the linked user.
- Replies use HTML parse mode, and everything interpolated is escaped.
- Logs carry only error classes: no chat text, names or ids.
- User errors and unexpected failures return **200**, so Telegram does not retry them. Only a bad or missing secret gets **401**.

## 8. How to test

**Automated:**

```sh
# Deno (from a copy — the root package.json confuses Deno's npm resolution)
cp -R supabase/functions /tmp/fn-tg && cd /tmp/fn-tg && deno check telegram-webhook/index.ts send-push/index.ts && deno test
# App
corepack yarn test src/features/notifications/telegram
```

**Manual, on preprod with the dev bot:**

1. **Link.** Settings → Notifications → Telegram → **Connect**, then tap **Start** in Telegram.
   - The bot welcomes you by first name, and the app flips to "@you · linked" within a few seconds.
   - The activity log shows "Telegram linked".
2. **Code is single-use and expires.** Open the same `t.me/...start=` link again: "link expired or already used". A code older than 10 minutes gives the same reply.
3. **Commands and menu.** `/shifts`, `/today`, `/hours`, `/news` and the menu buttons (Czech labels in a Czech account). Page with ◀ ▶ on /shifts and /hours: the same message is redrawn.
4. **Notifications.**
   - Publish a month for that user: you get "Rozpis zveřejněn" with **Potvrdit**. Tap it: a toast says how many shifts were confirmed, the button disappears, and the app shows the shifts as confirmed.
5. **Requests.**
   - As an employee, request time off.
   - As an admin, the bot sends "Žádost o volno". **📥 Žádosti** → **Schválit**: the card shows "✓ Schváleno" and the request is approved in the app.
   - The admin's *own* request never appears (four eyes). The same applies to swaps they take part in and to role requests above their rank.
6. **Switches.** Mute in Settings: no messages. Turn off "Shift changes": no shift messages, but announcements still arrive.
7. **Plan gate.** On a Free org (trial expired): Connect shows the upgrade prompt, and an already-linked chat gets "part of the Team plan" for commands and no notifications.
8. **Unlink.**
   - `/stop` in the chat, or **Disconnect** in Settings: "Telegram unlinked" in the activity log.
   - Blocking the bot in Telegram unlinks it at the next notification.
9. **Webhook auth.** `curl -X POST https://<ref>.supabase.co/functions/v1/telegram-webhook -d '{}'` → **401**.

**Logs:** Supabase Dashboard → Edge Functions → `telegram-webhook` / `send-push` → Logs.
