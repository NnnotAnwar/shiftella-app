#!/usr/bin/env bash
# Validate deploy/hetzner/shiftella.caddy against the edge base config with the
# same Caddy version as the server (caddy:2.10-alpine). Needs Docker.
#   deploy/hetzner/ci/validate-caddy.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/base" "$work/sites"
cp "$here/edge-base.Caddyfile" "$work/base/Caddyfile"
# The dev password hash is rendered on the server; use a throw-away bcrypt hash
# (of the word "ci") so the config can be provisioned here.
sed 's|__DEV_AUTH_HASH__|$2a$14$D5e/dw2ryRaIMRTarSTlt.pvcy0Eio3s0WMJN0zCIpPMjq/eLe64m|' \
  "$here/../shiftella.caddy" > "$work/sites/shiftella.caddy"
docker run --rm -e ACME_EMAIL=ci@example.com \
  -v "$work/base:/etc/caddy/base:ro" -v "$work/sites:/etc/caddy/sites:ro" \
  caddy:2.10-alpine caddy validate --config /etc/caddy/base/Caddyfile --adapter caddyfile
