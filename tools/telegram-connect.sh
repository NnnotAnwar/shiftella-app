#!/usr/bin/env bash
# =============================================================================
# One-step Telegram bot hookup for an environment:
#   bash tools/telegram-connect.sh prod     # @shiftella_bot    → shiftella.app
#   bash tools/telegram-connect.sh dev      # @shiftelladev_bot → dev.shiftella.app
#
# Asks for the bot token from @BotFather (hidden input, never printed or saved),
# makes a fresh webhook secret, stores token + secret + username as Supabase
# secrets of that project, then runs tools/telegram-setup.sh (webhook, command
# menu, descriptions). Safe to re-run.
# =============================================================================
set -euo pipefail

case "${1:-}" in
  prod) REF=dcqvipzjqxpbaymaxhxu; BOT=shiftella_bot ;;
  dev)  REF=fusnqxykhdzcvhqbsevb; BOT=shiftelladev_bot ;;
  *) echo "Usage: bash tools/telegram-connect.sh prod|dev" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."

echo "Bot: @${BOT}"
printf 'Paste the token of @%s from @BotFather and press Enter (it stays hidden): ' "$BOT"
read -rs TOKEN
echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
if ! [[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]]; then
  echo "✗ That doesn't look like a bot token (it should look like 123456789:AA…)." >&2
  exit 1
fi

# The token must belong to the expected bot.
ME=$(curl -sS "https://api.telegram.org/bot${TOKEN}/getMe")
case "$ME" in
  *"\"username\":\"${BOT}\""*) echo "✓ Token belongs to @${BOT}" ;;
  *'"ok":true'*) echo "✗ This token is for a different bot, not @${BOT}." >&2; exit 1 ;;
  *) echo "✗ Telegram rejected the token. Copy it again from @BotFather." >&2; exit 1 ;;
esac

SECRET=$(openssl rand -hex 32)
supabase secrets set --remote="$REF" --yes \
  TELEGRAM_BOT_TOKEN="$TOKEN" TELEGRAM_WEBHOOK_SECRET="$SECRET" TELEGRAM_BOT_USERNAME="$BOT" >/dev/null
echo "✓ Supabase secrets saved"

# Give the functions a moment to pick up the new secrets.
sleep 5
TELEGRAM_BOT_TOKEN="$TOKEN" TELEGRAM_WEBHOOK_SECRET="$SECRET" SUPABASE_PROJECT_REF="$REF" bash tools/telegram-setup.sh

echo
echo "Done. Open the app → Settings → Notifications → Telegram → Connect."
