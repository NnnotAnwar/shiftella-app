#!/usr/bin/env bash
# One-time (and re-runnable) Shiftella setup on the shared anwar.os Hetzner server.
# Run as root from a checkout of this repo (or after copying deploy/hetzner/):
#
#   sudo bash deploy/hetzner/setup-shared.sh "<CI deploy public key>"
#   sudo bash deploy/hetzner/setup-shared.sh "$(cat shiftella-ci.pub)"
#
# What it does (idempotent):
#   • user `shiftella-deploy` — no password, no sudo, NOT in the docker group
#   • /srv/sites/shiftella/{prod,dev}/releases owned by it, world-readable so the
#     edge Caddy container (another uid) can serve the files
#   • installs bin/shiftella-release as /usr/local/bin/shiftella-release
#   • authorized_keys: the CI key may ONLY run that script (restrict + forced command)
#   • a placeholder page in each env until the first deploy
# Re-run it after changing bin/shiftella-release (it updates the installed copy).
#
# It does NOT touch Caddy: installing deploy/hetzner/shiftella.caddy into
# /opt/edge/sites/ + reloading the edge is a separate manual step (README).
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
key=${1:-}
case "$key" in
  ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*) ;;
  *) echo "usage: $0 \"<CI deploy public key (ssh-ed25519 …)>\"" >&2; exit 1 ;;
esac

here=$(cd "$(dirname "$0")" && pwd)
user=shiftella-deploy
root=/srv/sites/shiftella

# 1. Deploy user (system account, real shell needed for the forced command).
if ! id "$user" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/$user" --shell /bin/bash "$user"
  passwd -l "$user" >/dev/null
fi
for g in sudo docker adm; do
  if id -nG "$user" | tr ' ' '\n' | grep -qx "$g"; then gpasswd -d "$user" "$g" >/dev/null; fi
done

# 2. Release script.
install -m 0755 -o root -g root "$here/bin/shiftella-release" /usr/local/bin/shiftella-release

# 3. Directory layout (parents root-owned, env dirs owned by the deploy user).
install -d -m 0755 -o root -g root /srv/sites "$root"
for env in prod dev; do
  install -d -m 0755 -o "$user" -g "$user" "$root/$env" "$root/$env/releases"
  if [ ! -e "$root/$env/current" ]; then
    ph="$root/$env/releases/placeholder"
    install -d -m 0755 -o "$user" -g "$user" "$ph"
    printf '<!doctype html><meta charset="utf-8"><title>Shiftella</title><p>Shiftella (%s) — first deploy pending.</p>\n' "$env" > "$ph/index.html"
    chown "$user:$user" "$ph/index.html"; chmod 0644 "$ph/index.html"
    ln -sfn "$ph" "$root/$env/current"
    chown -h "$user:$user" "$root/$env/current"
  fi
done

# 4. SSH: the CI key can only run the release script.
ssh_dir="/home/$user/.ssh"
install -d -m 0700 -o "$user" -g "$user" "$ssh_dir"
line="restrict,command=\"/usr/local/bin/shiftella-release\" $key"
auth="$ssh_dir/authorized_keys"
touch "$auth"
grep -qxF "$line" "$auth" || echo "$line" >> "$auth"
chown "$user:$user" "$auth"; chmod 0600 "$auth"

# Make sure sshd allows this user if the server uses AllowUsers / AllowGroups.
if sshd -T 2>/dev/null | grep -qiE '^allow(users|groups) '; then
  echo "NOTE: sshd has AllowUsers/AllowGroups set — add '$user' there, then: systemctl reload ssh" >&2
fi

echo "done: $user, $root/{prod,dev}, /usr/local/bin/shiftella-release"
echo "test from your laptop:  ssh -i <ci key> $user@<server> \"list prod\""
