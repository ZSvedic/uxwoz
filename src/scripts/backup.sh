#!/bin/bash
# Pull the hosted app's screen cache into backups/ at the repo root (git-ignored).
# Run by hand from anywhere: src/scripts/backup.sh. On the owner's Mac a launchd job runs it on Mondays at 10:00
# (~/Library/LaunchAgents/com.uxwoz.backup.plist; its output goes to backups/backup.log).
# It reads two lines from the repo root's .env.local (git-ignored, read by nothing else):
#   UXWOZ_BACKUP_URL=https://<the host's address>
#   UXWOZ_BACKUP_OWNER=<the UXWOZ_OWNER password set on the host>
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
root="$(cd "$(dirname "$0")/../.." && pwd)"
conf="$root/.env.local"
umask 077  # a backup holds every share token: readable by the owner only
# A value as written in .env.local: no line ending, no quotes around it.
line() { [ -f "$conf" ] && grep -E "^$1=" "$conf" | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' || true; }
url="${UXWOZ_BACKUP_URL:-$(line UXWOZ_BACKUP_URL)}"
owner="${UXWOZ_BACKUP_OWNER:-$(line UXWOZ_BACKUP_OWNER)}"
[ -n "$url" ] && [ -n "$owner" ] || { echo "backup: put UXWOZ_BACKUP_URL and UXWOZ_BACKUP_OWNER in $conf" >&2; exit 1; }

mkdir -p "$root/backups"
out="$root/backups/screen-cache-$(date +%Y-%m-%d-%H%M).json"
trap 'rm -f "$out.part"' EXIT
# The password goes in a header read from stdin, so it never shows in the process list or the address.
# curl's config file treats \ and " as special inside quotes: escape them.
esc=${owner//\\/\\\\}; esc=${esc//\"/\\\"}
code=$(printf 'header = "Cookie: uxwoz_owner=%s"\n' "$esc" | curl -sS -m 120 -K - -o "$out.part" -w '%{http_code}' "${url%/}/api/backup") || code=000
if [ "$code" != 200 ] || [ "$(head -c 1 "$out.part")" != "{" ] || [ "$(tail -c 1 "$out.part")" != "}" ]; then
  rm -f "$out.part"
  echo "$(date '+%Y-%m-%d %H:%M') backup FAILED: HTTP $code from ${url%/}/api/backup" >&2
  exit 1
fi
mv "$out.part" "$out"
echo "$(date '+%Y-%m-%d %H:%M') backup saved: $out ($(wc -c < "$out" | tr -d ' ') bytes)"
