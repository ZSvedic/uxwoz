#!/bin/bash
# Pull the hosted app's screen cache into backups/ at the repo root (git-ignored).
# Run by hand from anywhere: src/scripts/backup.sh. A launchd job runs it weekly (see README, "Host it").
# It reads two lines from the repo root's .env.local (git-ignored, read by nothing else):
#   UXWOZ_BACKUP_URL=https://<the host's address>
#   UXWOZ_BACKUP_OWNER=<the UXWOZ_OWNER password set on the host>
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
root="$(cd "$(dirname "$0")/../.." && pwd)"
conf="$root/.env.local"
line() { [ -f "$conf" ] && grep -E "^$1=" "$conf" | tail -1 | cut -d= -f2- || true; }
url="${UXWOZ_BACKUP_URL:-$(line UXWOZ_BACKUP_URL)}"
owner="${UXWOZ_BACKUP_OWNER:-$(line UXWOZ_BACKUP_OWNER)}"
[ -n "$url" ] && [ -n "$owner" ] || { echo "backup: put UXWOZ_BACKUP_URL and UXWOZ_BACKUP_OWNER in $conf" >&2; exit 1; }

mkdir -p "$root/backups"
out="$root/backups/screen-cache-$(date +%Y-%m-%d-%H%M).json"
# The password goes in a header read from stdin, so it never shows in the process list or the address.
code=$(printf 'header = "Cookie: uxwoz_owner=%s"\n' "$owner" | curl -sS -m 120 -K - -o "$out.part" -w '%{http_code}' "${url%/}/api/backup") || code=000
if [ "$code" != 200 ] || [ "$(head -c 1 "$out.part")" != "{" ] || [ "$(tail -c 1 "$out.part")" != "}" ]; then
  rm -f "$out.part"
  echo "$(date '+%Y-%m-%d %H:%M') backup FAILED: HTTP $code from ${url%/}/api/backup" >&2
  exit 1
fi
mv "$out.part" "$out"
echo "$(date '+%Y-%m-%d %H:%M') backup saved: $out ($(wc -c < "$out" | tr -d ' ') bytes)"
