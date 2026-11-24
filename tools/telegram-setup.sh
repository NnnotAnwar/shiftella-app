#!/usr/bin/env bash
# =============================================================================
# Telegram bot setup: webhook + command menus + descriptions (CS + EN).
# Idempotent — safe to re-run. See docs/telegram.md.
#
#   TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… SUPABASE_PROJECT_REF=… \
#     bash tools/telegram-setup.sh
#
# The token is only sent to api.telegram.org and never printed.
# =============================================================================
set -euo pipefail

: "${TELEGRAM_BOT_TOKEN:?set TELEGRAM_BOT_TOKEN}"
: "${TELEGRAM_WEBHOOK_SECRET:?set TELEGRAM_WEBHOOK_SECRET (the same value as the Supabase secret)}"
: "${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF (e.g. dcqvipzjqxpbaymaxhxu)}"

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
WEBHOOK_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/telegram-webhook"

call() { # call <method> <json>
  local out
  out=$(curl -sS -X POST "${API}/$1" -H 'Content-Type: application/json' --data "$2")
  case "$out" in
    *'"ok":true'*) echo "✓ $1" ;;
    *) echo "✗ $1: $out" >&2; exit 1 ;;
  esac
}

call setWebhook "$(cat <<JSON
{"url":"${WEBHOOK_URL}","secret_token":"${TELEGRAM_WEBHOOK_SECRET}","allowed_updates":["message","callback_query"],"drop_pending_updates":true,"max_connections":20}
JSON
)"

call setMyCommands '{"commands":[
  {"command":"shifts","description":"Your shifts for the next 7 days"},
  {"command":"today","description":"Today'"'"'s shift and who else is on"},
  {"command":"hours","description":"Hours worked this month"},
  {"command":"news","description":"Latest announcements"},
  {"command":"requests","description":"Requests waiting for your decision"},
  {"command":"help","description":"What I can do"},
  {"command":"stop","description":"Disconnect this chat"}]}'

call setMyCommands '{"language_code":"cs","commands":[
  {"command":"smeny","description":"Vaše směny na příštích 7 dní"},
  {"command":"dnes","description":"Dnešní směna a kdo je s vámi"},
  {"command":"hodiny","description":"Odpracované hodiny tento měsíc"},
  {"command":"oznameni","description":"Nejnovější oznámení"},
  {"command":"zadosti","description":"Žádosti, které čekají na vás"},
  {"command":"help","description":"Co umím"},
  {"command":"stop","description":"Odpojit tento chat"}]}'

call setMyDescription '{"description":"Shiftella in Telegram: shift and schedule notifications, team announcements, your hours, and approving requests with one tap. Link it from the app: Settings → Notifications → Telegram."}'
call setMyDescription '{"language_code":"cs","description":"Shiftella v Telegramu: oznámení o směnách a rozpisu, novinky z týmu, vaše hodiny a schvalování žádostí jedním klepnutím. Propojíte v aplikaci: Nastavení → Oznámení → Telegram."}'
call setMyShortDescription '{"short_description":"Shift notifications and quick answers from Shiftella."}'
call setMyShortDescription '{"language_code":"cs","short_description":"Oznámení o směnách a rychlé odpovědi ze Shiftelly."}'

# Show what Telegram now has (no secrets in this output).
curl -sS "${API}/getWebhookInfo" | sed -E 's/"ip_address":"[^"]*",?//'
echo
